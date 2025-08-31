
------------------------------------------------------------
-- YouTube Skip (one-shot click in your *normal* Safari tab)
-- Hotkey: Ctrl+Alt+Cmd+Y  → arm/disarm
-- Arm shows: "SEARCHING FOR SKIP" (notification + toast)
-- On successful click: "HAMMER TIME" then "CLICKED" (toasts), auto-disarm
-- Local HTTP:
--   GET http://127.0.0.1:8777/yt-status           -> enabled|disabled
--   GET http://127.0.0.1:8777/yt-url              -> current Safari URL (debug)
--   GET http://127.0.0.1:8777/yt-debug            -> JSON {armed, frontApp, url, frame}
--   GET http://127.0.0.1:8777/yt-skip?x=..&y=..   -> click (CSS px in viewport)
------------------------------------------------------------

local YT_PORT = 8777
local ytSkipperEnabled = false   -- one-shot armed state
local ytLastClickAt = 0          -- 1s cooldown
local jitter = 2                 -- px jitter on click
local hyperLocal = hyper or {"ctrl","alt","cmd"}

-- helpers
local function toast(msg, dur) hs.alert.show(msg, dur or 1) end
local function notifyBoth(title, text, seconds)
  hs.notify.new({ title = title, informativeText = text, withdrawAfter = seconds or 2 }):send()
  toast(text, (seconds or 2) * 0.9)
  print(string.format("[yt-skip] %s: %s", title, text))
end

-- Returns the front Safari tab URL (native first, JS fallback)
local function currentSafariURL()
  -- native property (no JS permission needed)
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

  -- JS fallback (requires Safari → Develop → Allow JavaScript from Apple Events)
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

-- Accept any *.youtube.com and youtu.be (robust to :port)
local function isYouTubeURL(u)
  if not u or u == "" then return false, "(empty)" end
  local hostport = u:match("^%w+://([^/]+)") or ""    -- scheme://host[:port]
  local host = hostport:lower():match("^[^:]+") or "" -- strip :port if present
  local ok = (host == "youtu.be") or (host:sub(-11) == "youtube.com")
  return ok, host
end

-- Frontmost app name
local function frontAppName()
  local win = hs.window.frontmostWindow()
  if not win then return "" end
  local app = win:application()
  return app and app:name() or ""
end

-- Safari AXWebArea frame (screen coords)
local function safariWebAreaFrame()
  local win = hs.window.frontmostWindow()
  if not win then return nil end
  local app = win:application()
  if not app or app:name() ~= "Safari" then return nil end
  local axwin = hs.axuielement.windowElement(win)
  if not axwin then return nil end

  local function findWebArea(ax)
    if not ax then return nil end
    if ax:attributeValue("AXRole") == "AXWebArea" then return ax end
    local kids = ax:attributeValue("AXChildren") or {}
    for _, child in ipairs(kids) do
      local got = findWebArea(child)
      if got then return got end
    end
    return nil
  end

  local web = findWebArea(axwin)
  if not web then return nil end
  return web:attributeValue("AXFrame") -- {x=, y=, w=, h=}
end

-- URL-decode (basic)
local function urldecode(s)
  if not s then return s end
  s = s:gsub("+", " ")
  s = s:gsub("%%(%x%x)", function(h) return string.char(tonumber(h,16)) end)
  return s
end

-- Parse query string into table
local function parseQuery(q)
  local t = {}
  for k,v in string.gmatch(q or "", "([%w_]+)=([^&]+)") do
    t[k] = tonumber(v) or urldecode(v)
  end
  return t
end

-- Perform one trusted OS-level click at given viewport coords (x,y)
-- RETURNS: (status_number, body_string, content_type_string)
local function doOneClick(params)
  if not ytSkipperEnabled then return 403, "disabled", "text/plain" end
  if os.time() - ytLastClickAt < 1 then return 429, "cooldown", "text/plain" end

  local appName = frontAppName()
  if appName ~= "Safari" then
    return 400, "front app not Safari ("..appName..")", "text/plain"
  end

  local url = currentSafariURL()
  local okYT, host = isYouTubeURL(url)
  if not okYT then
    return 400, "not youtube (url="..(url or "")..", host="..(host or "")..")", "text/plain"
  end

  local frame = safariWebAreaFrame()
  if not frame then return 400, "no web area", "text/plain" end

  local x = tonumber(params.x); local y = tonumber(params.y)
  if not x or not y then return 400, "bad coords", "text/plain" end

  local sx = frame.x + x + math.random(-jitter, jitter)
  local sy = frame.y + y + math.random(-jitter, jitter)

  if sx < frame.x or sx > (frame.x + frame.w) or sy < frame.y or sy > (frame.y + frame.h) then
    return 400, string.format(
      "out of bounds (sx=%.1f, sy=%.1f, frame=%d,%d,%d,%d)",
      sx, sy, frame.x, frame.y, frame.w, frame.h
    ), "text/plain"
  end

  -- real, trusted click
  toast("HAMMER TIME", 1)            -- <<< requested toast
  hs.eventtap.leftClick({ x = sx, y = sy })

  ytLastClickAt = os.time()
  ytSkipperEnabled = false
  notifyBoth("YouTube Skipper", "CLICKED", 2)
  return 200, "ok", "text/plain"
end

-- Local HTTP server (return order: body, status, headers)
if ytServer then ytServer:stop() end
ytServer = hs.httpserver.new(false, true)
ytServer:setPort(YT_PORT)
ytServer:setCallback(function(method, path, headers, body)
  if method ~= "GET" then
    return "method not allowed", 405, { ["Content-Type"] = "text/plain" }
  end

  local route, query = path:match("^/?([^%?]*)%??(.*)$")
  local params = parseQuery(query or "")

  if route == "yt-skip" then
    local status, text, ctype = doOneClick(params)
    return text, status, { ["Content-Type"] = ctype }

  elseif route == "yt-status" then
    local state = ytSkipperEnabled and "enabled" or "disabled"
    return state, 200, { ["Content-Type"] = "text/plain" }

  elseif route == "yt-url" then
    local url = currentSafariURL() or ""
    return url, 200, { ["Content-Type"] = "text/plain" }

  elseif route == "yt-debug" then
    local frame = safariWebAreaFrame()
    local dbg = {
      armed = ytSkipperEnabled,
      frontApp = frontAppName(),
      url = currentSafariURL() or "",
      frame = frame and {x=frame.x, y=frame.y, w=frame.w, h=frame.h} or nil
    }
    return hs.json.encode(dbg), 200, { ["Content-Type"] = "application/json" }

  else
    return "not found", 404, { ["Content-Type"] = "text/plain" }
  end
end)
ytServer:start()

-- Hotkey: arm/disarm (one-shot)
hs.hotkey.bind(hyperLocal, "Y", function()
  ytSkipperEnabled = not ytSkipperEnabled
  if ytSkipperEnabled then
    notifyBoth("YouTube Skipper", "SEARCHING FOR SKIP", 3)
  else
    notifyBoth("YouTube Skipper", "OFF", 2)
  end
end)
