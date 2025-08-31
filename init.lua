------------------------------------------------------------
-- YouTube Skipper (remote arm + one-shot click)
-- HTTP:
--   GET /yt-status
--   GET /yt-url
--   GET /yt-debug
--   GET /yt-arm?token=...
--   GET /yt-disarm?token=...
--   GET /yt-skip?x=..&y=..   -> on success: toast "AD HAMMERED" (2s)
--                               on failure: toast "SAD HAMMER: <reason>" (2s)
------------------------------------------------------------
local YT_PORT = 8777
local ytSkipperEnabled = false
local ytLastClickAt = 0
local jitter = 2
local hyperLocal = hyper or {"ctrl","alt","cmd"}

-- Option 3 (remote arm)
local ALLOW_REMOTE_ARM = true
local ARM_TOKEN = "REPLACE_WITH_LONG_RANDOM_SECRET"

local function toast(msg, dur) hs.alert.show(msg, dur or 2) end
local function notifyBoth(title, text, seconds)
  hs.notify.new({ title = title, informativeText = text, withdrawAfter = seconds or 2 }):send()
  hs.alert.show(text, (seconds or 2) * 0.9)
  print(string.format("[yt-skip] %s: %s", title, text))
end

-- Safari helpers
local function frontAppName()
  local win = hs.window.frontmostWindow()
  if not win then return "" end
  local app = win:application()
  return app and app:name() or ""
end

local function currentSafariURL()
  local ok, out = hs.osascript.applescript([[
    tell application "Safari"
      if (count of windows) = 0 then return ""
      try
        return URL of current tab of front window
      on error
        return ""
      end try
    end tell
  ]])
  local url = (ok and out) or ""
  if url == "" then
    local ok2, jsOut = hs.osascript.applescript([[
      tell application "Safari"
        if (count of windows) = 0 then return ""
        try
          return do JavaScript "location.href" in current tab of front window
        on error
          return ""
        end try
      end tell
    ]])
    url = (ok2 and jsOut) or ""
  end
  print("[yt-skip] front Safari URL:", url)
  return url
end

local function isYouTubeURL(u)
  if not u or u == "" then return false, "(empty)" end
  local hostport = u:match("^%w+://([^/]+)") or ""
  local host = hostport:lower():match("^[^:]+") or ""
  local ok = (host == "youtu.be") or (host:sub(-11) == "youtube.com")
  return ok, host
end

local function safariWebAreaFrame()
  local win = hs.window.frontmostWindow()
  if not win then return nil end
  local app = win:application()
  if not app or app:name() ~= "Safari" then return nil end
  local axwin = hs.axuielement.windowElement(win); if not axwin then return nil end
  local function findWebArea(ax)
    if not ax then return nil end
    if ax:attributeValue("AXRole") == "AXWebArea" then return ax end
    for _, child in ipairs(ax:attributeValue("AXChildren") or {}) do
      local got = findWebArea(child); if got then return got end
    end
    return nil
  end
  local web = findWebArea(axwin); if not web then return nil end
  return web:attributeValue("AXFrame")
end

-- url parsing
local function urldecode(s) if not s then return s end s=s:gsub("+"," "); s=s:gsub("%%(%x%x)",function(h) return string.char(tonumber(h,16)) end); return s end
local function parseQuery(q) local t={}; for k,v in string.gmatch(q or "", "([%w_%-]+)=([^&]+)") do t[k]=tonumber(v) or urldecode(v) end return t end

-- do one trusted click
local function doOneClick(params)
  if not ytSkipperEnabled then toast("SAD HAMMER: disabled", 2); return 403, "disabled", "text/plain" end
  if os.time() - ytLastClickAt < 1 then toast("SAD HAMMER: cooldown", 2); return 429, "cooldown", "text/plain" end

  local appName = frontAppName()
  if appName ~= "Safari" then
    local msg = "front app not Safari ("..appName..")"
    toast("SAD HAMMER: "..msg, 2); return 400, msg, "text/plain"
  end

  local url = currentSafariURL()
  local okYT, host = isYouTubeURL(url)
  if not okYT then
    local msg = "not youtube (url="..(url or "")..", host="..(host or "")..")"
    toast("SAD HAMMER: "..msg, 2); return 400, msg, "text/plain"
  end

  local frame = safariWebAreaFrame()
  if not frame then toast("SAD HAMMER: no web area", 2); return 400, "no web area", "text/plain" end

  local x = tonumber(params.x); local y = tonumber(params.y)
  if not x or not y then toast("SAD HAMMER: bad coords", 2); return 400, "bad coords", "text/plain" end

  local sx = frame.x + x + math.random(-jitter, jitter)
  local sy = frame.y + y + math.random(-jitter, jitter)
  if sx < frame.x or sx > (frame.x + frame.w) or sy < frame.y or sy > (frame.y + frame.h) then
    local msg = string.format("out of bounds (sx=%.1f, sy=%.1f, frame=%d,%d,%d,%d)", sx, sy, frame.x, frame.y, frame.w, frame.h)
    toast("SAD HAMMER: "..msg, 2); return 400, msg, "text/plain"
  end

  -- click!
  hs.eventtap.leftClick({ x = sx, y = sy })

  ytLastClickAt = os.time()
  ytSkipperEnabled = false
  hs.alert.show("AD HAMMERED ;)", 3)  -- success toast
  return 200, "ok", "text/plain"
end

-- HTTP server
if ytServer then ytServer:stop() end
ytServer = hs.httpserver.new(false, true)
ytServer:setPort(YT_PORT)
ytServer:setCallback(function(method, path, headers, body)
  if method ~= "GET" then
    return "method not allowed", 405, {["Content-Type"]="text/plain"} end

  local route, query = path:match("^/?([^%?]*)%??(.*)$")
  local params = parseQuery(query or "")

  if route == "yt-skip" then
    local status, text, ctype = doOneClick(params)
    return text, status, {["Content-Type"]=ctype}

  elseif route == "yt-status" then
    local state = ytSkipperEnabled and "enabled" or "disabled"
    return state, 200, {["Content-Type"]="text/plain"}

  elseif route == "yt-url" then
    local url = currentSafariURL() or ""
    return url, 200, {["Content-Type"]="text/plain"}

  elseif route == "yt-debug" then
    local frame = safariWebAreaFrame()
    local dbg = {
      armed = ytSkipperEnabled,
      frontApp = frontAppName(),
      url = currentSafariURL() or "",
      frame = frame and {x=frame.x, y=frame.y, w=frame.w, h=frame.h} or nil
    }
    return hs.json.encode(dbg), 200, {["Content-Type"]="application/json"}

  elseif route == "yt-arm" then
    if not ALLOW_REMOTE_ARM then return "forbidden", 403, {["Content-Type"]="text/plain"} end
    local token = params.token or headers["token"]; if token ~= ARM_TOKEN then return "unauthorized", 401, {["Content-Type"]="text/plain"} end
    ytSkipperEnabled = true
    -- hs.alert.show("YT SKIPPER: ON", 3)
    return "enabled", 200, {["Content-Type"]="text/plain"}

  elseif route == "yt-disarm" then
    if not ALLOW_REMOTE_ARM then return "forbidden", 403, {["Content-Type"]="text/plain"} end
    local token = params.token or headers["token"]; if token ~= ARM_TOKEN then return "unauthorized", 401, {["Content-Type"]="text/plain"} end
    ytSkipperEnabled = false
    -- hs.alert.show("YT SKIPPER: OFF", 2)
    return "disabled", 200, {["Content-Type"]="text/plain"}

  else
    return "not found", 404, {["Content-Type"]="text/plain"}
  end
end)
ytServer:start()

-- Manual arm/disarm hotkey (optional)
hs.hotkey.bind(hyperLocal, "Y", function()
  ytSkipperEnabled = not ytSkipperEnabled
  hs.alert.show(ytSkipperEnabled and "YT SKIPPER: ON" or "YT SKIPPER:OFF", ytSkipperEnabled and 3 or 2)
end)
