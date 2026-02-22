#include <napi.h>

#if defined(__APPLE__)
// ─── macOS: CoreGraphics ─────────────────────────────────────────────
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>

static int64_t GetWindowPidImpl(int64_t windowId) {
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
    kCGWindowListOptionIncludingWindow, static_cast<CGWindowID>(windowId));
  if (!windowList) return -1;

  int64_t pid = -1;
  if (CFArrayGetCount(windowList) > 0) {
    CFDictionaryRef info = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, 0);
    CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowOwnerPID);
    if (pidRef) {
      CFNumberGetValue(pidRef, kCFNumberSInt64Type, &pid);
    }
  }
  CFRelease(windowList);
  return pid;
}

struct WindowInfo {
  int64_t windowId;
  std::string title;
};

static std::vector<WindowInfo> GetWindowsForPidImpl(int64_t targetPid) {
  std::vector<WindowInfo> result;
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
    kCGNullWindowID);
  if (!windowList) return result;

  CFIndex count = CFArrayGetCount(windowList);
  for (CFIndex i = 0; i < count; i++) {
    CFDictionaryRef info = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

    CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowOwnerPID);
    if (!pidRef) continue;
    int64_t pid = 0;
    CFNumberGetValue(pidRef, kCFNumberSInt64Type, &pid);
    if (pid != targetPid) continue;

    // Skip windows with layer != 0 (menus, tooltips, etc.)
    CFNumberRef layerRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowLayer);
    if (layerRef) {
      int32_t layer = 0;
      CFNumberGetValue(layerRef, kCFNumberSInt32Type, &layer);
      if (layer != 0) continue;
    }

    CFNumberRef widRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowNumber);
    if (!widRef) continue;
    int64_t wid = 0;
    CFNumberGetValue(widRef, kCFNumberSInt64Type, &wid);

    std::string title;
    CFStringRef nameRef = (CFStringRef)CFDictionaryGetValue(info, kCGWindowName);
    if (nameRef) {
      CFIndex len = CFStringGetLength(nameRef);
      CFIndex maxSize = CFStringGetMaximumSizeForEncoding(len, kCFStringEncodingUTF8) + 1;
      std::vector<char> buf(maxSize);
      if (CFStringGetCString(nameRef, buf.data(), maxSize, kCFStringEncodingUTF8)) {
        title = buf.data();
      }
    }

    // Skip windows with empty titles (usually auxiliary windows)
    if (title.empty()) continue;

    result.push_back({ wid, title });
  }
  CFRelease(windowList);
  return result;
}

#elif defined(_WIN32)
// ─── Windows: Win32 ──────────────────────────────────────────────────
#include <windows.h>
#include <vector>
#include <string>

static int64_t GetWindowPidImpl(int64_t windowId) {
  DWORD pid = 0;
  GetWindowThreadProcessId(reinterpret_cast<HWND>(windowId), &pid);
  return pid > 0 ? static_cast<int64_t>(pid) : -1;
}

struct WindowInfo {
  int64_t windowId;
  std::string title;
};

struct EnumCtx {
  DWORD targetPid;
  std::vector<WindowInfo>* results;
};

static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
  auto* ctx = reinterpret_cast<EnumCtx*>(lParam);
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (pid != ctx->targetPid) return TRUE;
  if (!IsWindowVisible(hwnd)) return TRUE;

  // Skip tool windows (tooltips, menus, etc.)
  LONG exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
  if (exStyle & WS_EX_TOOLWINDOW) return TRUE;

  wchar_t buf[512];
  int len = GetWindowTextW(hwnd, buf, 512);
  if (len <= 0) return TRUE;

  // Convert wide string to UTF-8
  int utf8Len = WideCharToMultiByte(CP_UTF8, 0, buf, len, nullptr, 0, nullptr, nullptr);
  std::string title(utf8Len, '\0');
  WideCharToMultiByte(CP_UTF8, 0, buf, len, &title[0], utf8Len, nullptr, nullptr);

  ctx->results->push_back({ reinterpret_cast<int64_t>(hwnd), title });
  return TRUE;
}

static std::vector<WindowInfo> GetWindowsForPidImpl(int64_t targetPid) {
  std::vector<WindowInfo> result;
  EnumCtx ctx = { static_cast<DWORD>(targetPid), &result };
  EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&ctx));
  return result;
}

#elif defined(__linux__)
// ─── Linux: X11 ──────────────────────────────────────────────────────
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <vector>
#include <string>
#include <cstring>

static Display* GetDisplay() {
  static Display* dpy = XOpenDisplay(nullptr);
  return dpy;
}

static int64_t GetWindowPidImpl(int64_t windowId) {
  Display* dpy = GetDisplay();
  if (!dpy) return -1;

  Atom pidAtom = XInternAtom(dpy, "_NET_WM_PID", True);
  if (pidAtom == None) return -1;

  Atom actualType;
  int actualFormat;
  unsigned long nItems, bytesAfter;
  unsigned char* prop = nullptr;

  if (XGetWindowProperty(dpy, static_cast<Window>(windowId), pidAtom,
      0, 1, False, XA_CARDINAL, &actualType, &actualFormat,
      &nItems, &bytesAfter, &prop) == Success && prop) {
    int64_t pid = static_cast<int64_t>(*reinterpret_cast<unsigned long*>(prop));
    XFree(prop);
    return pid;
  }
  return -1;
}

struct WindowInfo {
  int64_t windowId;
  std::string title;
};

static void CollectWindowsForPid(Display* dpy, Window root, int64_t targetPid,
                                  Atom pidAtom, Atom nameAtom, std::vector<WindowInfo>& result) {
  Window parent, *children = nullptr;
  unsigned int nChildren = 0;
  if (!XQueryTree(dpy, root, &root, &parent, &children, &nChildren)) return;

  for (unsigned int i = 0; i < nChildren; i++) {
    // Check PID
    Atom actualType;
    int actualFormat;
    unsigned long nItems, bytesAfter;
    unsigned char* prop = nullptr;

    if (XGetWindowProperty(dpy, children[i], pidAtom, 0, 1, False,
        XA_CARDINAL, &actualType, &actualFormat, &nItems, &bytesAfter, &prop) == Success && prop) {
      int64_t pid = static_cast<int64_t>(*reinterpret_cast<unsigned long*>(prop));
      XFree(prop);

      if (pid == targetPid) {
        // Check if mapped (visible)
        XWindowAttributes attrs;
        if (XGetWindowAttributes(dpy, children[i], &attrs) && attrs.map_state == IsViewable) {
          std::string title;
          unsigned char* nameProp = nullptr;
          if (XGetWindowProperty(dpy, children[i], nameAtom, 0, 256, False,
              XInternAtom(dpy, "UTF8_STRING", False), &actualType, &actualFormat,
              &nItems, &bytesAfter, &nameProp) == Success && nameProp) {
            title = reinterpret_cast<char*>(nameProp);
            XFree(nameProp);
          }
          if (!title.empty()) {
            result.push_back({ static_cast<int64_t>(children[i]), title });
          }
        }
      }
    }

    // Recurse into children
    CollectWindowsForPid(dpy, children[i], targetPid, pidAtom, nameAtom, result);
  }
  if (children) XFree(children);
}

static std::vector<WindowInfo> GetWindowsForPidImpl(int64_t targetPid) {
  std::vector<WindowInfo> result;
  Display* dpy = GetDisplay();
  if (!dpy) return result;

  Atom pidAtom = XInternAtom(dpy, "_NET_WM_PID", True);
  Atom nameAtom = XInternAtom(dpy, "_NET_WM_NAME", True);
  if (pidAtom == None) return result;

  Window root = DefaultRootWindow(dpy);
  CollectWindowsForPid(dpy, root, targetPid, pidAtom, nameAtom, result);
  return result;
}

#else
// ─── Unsupported platform ────────────────────────────────────────────
static int64_t GetWindowPidImpl(int64_t) { return -1; }
struct WindowInfo { int64_t windowId; std::string title; };
static std::vector<WindowInfo> GetWindowsForPidImpl(int64_t) { return {}; }
#endif

// ─── N-API bindings ──────────────────────────────────────────────────

static Napi::Value GetWindowPid(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected windowId (number)").ThrowAsJavaScriptException();
    return env.Null();
  }
  int64_t windowId = info[0].As<Napi::Number>().Int64Value();
  int64_t pid = GetWindowPidImpl(windowId);
  return Napi::Number::New(env, static_cast<double>(pid));
}

static Napi::Value GetWindowsForPid(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected pid (number)").ThrowAsJavaScriptException();
    return env.Null();
  }
  int64_t pid = info[0].As<Napi::Number>().Int64Value();
  auto windows = GetWindowsForPidImpl(pid);

  Napi::Array arr = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); i++) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("windowId", Napi::Number::New(env, static_cast<double>(windows[i].windowId)));
    obj.Set("title", Napi::String::New(env, windows[i].title));
    arr.Set(static_cast<uint32_t>(i), obj);
  }
  return arr;
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getWindowPid", Napi::Function::New(env, GetWindowPid));
  exports.Set("getWindowsForPid", Napi::Function::New(env, GetWindowsForPid));
  return exports;
}

NODE_API_MODULE(window_utils, Init)
