local claims = {
  email_verified: false,
} + std.extVar('claims');

local username =
  if std.objectHas(claims, 'preferred_username') && std.length(claims.preferred_username) > 0 then
    std.strReplace(std.strReplace(claims.preferred_username, '-', '_'), '.', '_')
  else if std.objectHas(claims, 'nickname') && std.length(claims.nickname) > 0 then
    std.strReplace(std.strReplace(claims.nickname, '-', '_'), '.', '_')
  else
    std.strReplace(std.split(claims.email, '@')[0], '.', '_');

local display_name =
  if std.objectHas(claims, 'name') && std.length(claims.name) > 0 then claims.name
  else if std.objectHas(claims, 'preferred_username') && std.length(claims.preferred_username) > 0 then claims.preferred_username
  else username;

{
  identity: {
    traits: {
      email: claims.email,
      username: username,
      display_name: display_name,
    },
  },
}
