local claims = {
  email_verified: false,
} + std.extVar('claims');

local rawUsername = std.strReplace(std.split(claims.email, '@')[0], '.', '_');

local display_name =
  if std.objectHas(claims, 'name') && std.length(claims.name) > 0 then claims.name
  else rawUsername;

{
  identity: {
    traits: {
      email: claims.email,
      username: rawUsername,
      display_name: display_name,
    },
  },
}
