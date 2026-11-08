-- /usr/lib/lua/luci/easy_setup_pkg/handler.lua
-- rpcd backend handler for luci-app-easy-setup.
-- Invoked by /usr/libexec/rpcd/easy_setup as: lua handler.lua <method> <json_params>
-- Reads method name from arg[1], JSON params from arg[2], writes JSON to stdout.

local json = require("luci.jsonc")
local ubus = require("ubus")

local nixio_ok, nixio = pcall(require, "nixio")
local nixio_fs = nixio_ok and nixio.fs or nil

-- Forkless directory listing (mirrors luci-app-dashboard collector.list_dir).
local function list_dir(path)
    if not path then return {} end
    if nixio_fs and nixio_fs.dir then
        local ok, iter = pcall(nixio_fs.dir, path)
        if ok and iter then
            local out = {}
            for e in iter do
                if e ~= "." and e ~= ".." then out[#out + 1] = e end
            end
            return out
        end
    end
    return {}
end

-- nixio raw-socket ICMP ping is available when the needed primitives exist.
local NIXIO_PING_OK = nixio_ok and nixio.gettimeofday and nixio.bit and true or false

local method = arg[1]
local params = arg[2] and json.parse(arg[2]) or {}

local function new_uci()
    return require("uci").cursor()
end

local function uci_str(uci, ...)
    local v = uci:get(...)
    if v == nil then return nil end
    if type(v) == "string" then return v end
    if type(v) == "table" then return table.concat(v, " ") end
    return tostring(v)
end

local function respond(data)
    print(json.stringify(data))
end

local function exec(cmd)
    local f = io.popen(cmd .. " 2>/dev/null")
    if not f then return "" end
    local out = f:read("*a"); f:close()
    return out
end

-- Single-quote a shell argument (POSIX-safe; escapes embedded single quotes).
local function shell_quote(s)
    return "'" .. tostring(s):gsub("'", "'\\''") .. "'"
end

local function p(key, default)
    local v = params[key]
    if v == nil then return default end
    if v == true then return "1" end
    if v == false then return "0" end
    return tostring(v)
end

local function pbool(key)
    local v = params[key]
    return v == true or v == "1"
end

local function p_has(key)
    return params[key] ~= nil
end

-- Run a command and return true only if it exited with status 0.
-- On OpenWrt (Lua 5.1 + musl) os.execute returns the wait status shifted
-- left by 8 (e.g. exit 1 -> 256), so a naive `== 0` check is always false.
local function cmd_ok(cmd)
    local r = os.execute(cmd)
    if r == 0 then return true end
    if r and r > 255 then return (math.floor(r / 256) % 256) == 0 end
    return r == true
end

local function ipv6_is_on(raw)
    return raw == nil or raw == "1" or raw == "auto"
end

local WIFI_COUNTRIES = {
    {"00","00 - World"},{"AD","AD - Andorra"},{"AE","AE - United Arab Emirates"},
    {"AF","AF - Afghanistan"},{"AG","AG - Antigua and Barbuda"},{"AI","AI - Anguilla"},
    {"AL","AL - Albania"},{"AM","AM - Armenia"},{"AN","AN - Netherlands Antilles"},
    {"AO","AO - Angola"},{"AQ","AQ - Antarctica"},{"AR","AR - Argentina"},
    {"AS","AS - American Samoa"},{"AT","AT - Austria"},{"AU","AU - Australia"},
    {"AW","AW - Aruba"},{"AZ","AZ - Azerbaijan"},{"BA","BA - Bosnia and Herzegovina"},
    {"BB","BB - Barbados"},{"BD","BD - Bangladesh"},{"BE","BE - Belgium"},
    {"BF","BF - Burkina Faso"},{"BG","BG - Bulgaria"},{"BH","BH - Bahrain"},
    {"BL","BL - Saint Barthelemy"},{"BM","BM - Bermuda"},{"BN","BN - Brunei Darussalam"},
    {"BO","BO - Bolivia"},{"BR","BR - Brazil"},{"BS","BS - Bahamas"},
    {"BT","BT - Bhutan"},{"BY","BY - Belarus"},{"BZ","BZ - Belize"},
    {"CA","CA - Canada"},{"CF","CF - Central African Republic"},{"CH","CH - Switzerland"},
    {"CI","CI - Cote d'Ivoire"},{"CL","CL - Chile"},{"CN","CN - China"},
    {"CO","CO - Colombia"},{"CR","CR - Costa Rica"},{"CU","CU - Cuba"},
    {"CX","CX - Christmas Island"},{"CY","CY - Cyprus"},{"CZ","CZ - Czech Republic"},
    {"DE","DE - Germany"},{"DJ","DJ - Djibouti"},{"DK","DK - Denmark"},
    {"DM","DM - Dominica"},{"DO","DO - Dominican Republic"},{"DZ","DZ - Algeria"},
    {"EC","EC - Ecuador"},{"EE","EE - Estonia"},{"EG","EG - Egypt"},
    {"ES","ES - Spain"},{"ET","ET - Ethiopia"},{"FI","FI - Finland"},
    {"FM","FM - Micronesia"},{"FR","FR - France"},{"GA","GA - Gabon"},
    {"GB","GB - United Kingdom"},{"GD","GD - Grenada"},{"GE","GE - Georgia"},
    {"GF","GF - French Guiana"},{"GH","GH - Ghana"},{"GL","GL - Greenland"},
    {"GP","GP - Guadeloupe"},{"GR","GR - Greece"},{"GT","GT - Guatemala"},
    {"GU","GU - Guam"},{"GY","GY - Guyana"},{"HK","HK - Hong Kong"},
    {"HN","HN - Honduras"},{"HR","HR - Croatia"},{"HT","HT - Haiti"},
    {"HU","HU - Hungary"},{"ID","ID - Indonesia"},{"IE","IE - Ireland"},
    {"IL","IL - Israel"},{"IN","IN - India"},{"IR","IR - Iran"},
    {"IS","IS - Iceland"},{"IT","IT - Italy"},{"JM","JM - Jamaica"},
    {"JO","JO - Jordan"},{"JP","JP - Japan"},{"KE","KE - Kenya"},
    {"KH","KH - Cambodia"},{"KN","KN - Saint Kitts and Nevis"},
    {"KP","KP - North Korea"},{"KR","KR - South Korea"},{"KW","KW - Kuwait"},
    {"KY","KY - Cayman Islands"},{"KZ","KZ - Kazakhstan"},{"LA","LA - Laos"},
    {"LB","LB - Lebanon"},{"LC","LC - Saint Lucia"},{"LI","LI - Liechtenstein"},
    {"LK","LK - Sri Lanka"},{"LS","LS - Lesotho"},{"LT","LT - Lithuania"},
    {"LU","LU - Luxembourg"},{"LV","LV - Latvia"},{"MA","MA - Morocco"},
    {"MC","MC - Monaco"},{"MD","MD - Moldova"},{"ME","ME - Montenegro"},
    {"MF","MF - Saint Martin"},{"MH","MH - Marshall Islands"},
    {"MK","MK - North Macedonia"},{"MN","MN - Mongolia"},{"MO","MO - Macao"},
    {"MP","MP - Northern Mariana Islands"},{"MQ","MQ - Martinique"},
    {"MR","MR - Mauritania"},{"MT","MT - Malta"},{"MU","MU - Mauritius"},
    {"MV","MV - Maldives"},{"MX","MX - Mexico"},{"MY","MY - Malaysia"},
    {"NG","NG - Nigeria"},{"NI","NI - Nicaragua"},{"NL","NL - Netherlands"},
    {"NO","NO - Norway"},{"NP","NP - Nepal"},{"NZ","NZ - New Zealand"},
    {"OM","OM - Oman"},{"PA","PA - Panama"},{"PE","PE - Peru"},
    {"PF","PF - French Polynesia"},{"PG","PG - Papua New Guinea"},
    {"PH","PH - Philippines"},{"PK","PK - Pakistan"},{"PL","PL - Poland"},
    {"PM","PM - Saint Pierre and Miquelon"},{"PR","PR - Puerto Rico"},
    {"PT","PT - Portugal"},{"PW","PW - Palau"},{"PY","PY - Paraguay"},
    {"QA","QA - Qatar"},{"RE","RE - Reunion"},{"RO","RO - Romania"},
    {"RS","RS - Serbia"},{"RU","RU - Russia"},{"RW","RW - Rwanda"},
    {"SA","SA - Saudi Arabia"},{"SE","SE - Sweden"},{"SG","SG - Singapore"},
    {"SI","SI - Slovenia"},{"SK","SK - Slovakia"},{"SN","SN - Senegal"},
    {"SR","SR - Suriname"},{"SV","SV - El Salvador"},{"SY","SY - Syria"},
    {"TC","TC - Turks and Caicos Islands"},{"TD","TD - Chad"},{"TG","TG - Togo"},
    {"TH","TH - Thailand"},{"TN","TN - Tunisia"},{"TR","TR - Turkey"},
    {"TT","TT - Trinidad and Tobago"},{"TW","TW - Taiwan"},{"TZ","TZ - Tanzania"},
    {"UA","UA - Ukraine"},{"UG","UG - Uganda"},{"US","US - United States"},
    {"UY","UY - Uruguay"},{"UZ","UZ - Uzbekistan"},{"VA","VA - Vatican City"},
    {"VC","VC - Saint Vincent and the Grenadines"},{"VE","VE - Venezuela"},
    {"VI","VI - US Virgin Islands"},{"VN","VN - Vietnam"},{"VU","VU - Vanuatu"},
    {"WS","WS - Samoa"},{"YE","YE - Yemen"},{"YT","YT - Mayotte"},
    {"ZA","ZA - South Africa"},{"ZW","ZW - Zimbabwe"},{"OTHER","Other..."},
}

local function wan_iface_exists(uci, iface)
    return uci:get("network", iface) ~= nil
end

local function create_wan_interface(uci, iface)
    if not wan_iface_exists(uci, iface) then
        uci:set("network", iface, "interface")
    end
end

-- wan6 (dhcpv6) interface management --------------------------------------
-- A separate wan6 interface with proto dhcpv6 is required for IPv6 to
-- actually function on DHCP/static/PPPoE WANs.  We manage it automatically
-- alongside the WAN IPv6 toggle.

local function wan6_proto(uci)
    return uci_str(uci, "network", "wan6", "proto")
end

local function wan6_device_for(wan_proto, wan_iface, wan_device)
    if wan_proto == "pppoe" then
        return "@" .. wan_iface
    end
    return wan_device or ""
end

-- Ensure a managed wan6 dhcpv6 interface exists, bound to the same link as WAN.
-- Returns "created", "updated", "noop" (already correct), or "custom"
-- (wan6 exists with a non-dhcpv6 proto -- leave it alone).
local function ensure_wan6(uci, wan_iface, wan_device, wan_proto)
    local w6proto = wan6_proto(uci)
    local dev     = wan6_device_for(wan_proto, wan_iface, wan_device)
    if w6proto == nil then
        uci:set("network", "wan6", "interface")
        uci:set("network", "wan6", "proto", "dhcpv6")
        if dev ~= "" then uci:set("network", "wan6", "device", dev) end
        uci:set("network", "wan6", "reqprefix", "auto")
        uci:set("network", "wan6", "delegate", "1")
        return "created"
    end
    if w6proto == "dhcpv6" then
        local cur_dev = uci_str(uci, "network", "wan6", "device") or ""
        if dev ~= "" and cur_dev ~= dev then
            uci:set("network", "wan6", "device", dev)
            return "updated"
        end
        return "noop"
    end
    return "custom"
end

-- Remove the wan6 interface if it is a managed dhcpv6 one.
local function remove_wan6(uci)
    if wan6_proto(uci) == "dhcpv6" then
        uci:delete("network", "wan6")
        return true
    end
    return false
end

local function setup_firewall_for_wan(iface)
    local fw_uci = new_uci()
    fw_uci:set_confdir("/etc/config")
    local changed = false

    local wan_zone_exists = false
    fw_uci:foreach("firewall", "zone", function(s)
        if s.name == "wan" then wan_zone_exists = true; return false end
    end)

    if not wan_zone_exists then
        local zone_name = fw_uci:add("firewall", "zone")
        fw_uci:set("firewall", zone_name, "name",    "wan")
        fw_uci:set("firewall", zone_name, "input",   "REJECT")
        fw_uci:set("firewall", zone_name, "output",  "ACCEPT")
        fw_uci:set("firewall", zone_name, "forward", "REJECT")
        fw_uci:set("firewall", zone_name, "masq",    "1")
        fw_uci:set("firewall", zone_name, "mtu_fix", "1")
        fw_uci:set("firewall", zone_name, "network", iface)
        changed = true
    else
        fw_uci:foreach("firewall", "zone", function(s)
            if s.name == "wan" then
                local nets = s.network or {}
                if type(nets) == "string" then nets = {nets} end
                local found = false
                for _, v in ipairs(nets) do if v == iface then found = true end end
                if not found then
                    nets[#nets+1] = iface
                    fw_uci:set("firewall", s[".name"], "network", nets)
                    changed = true
                end
                return false
            end
        end)
    end

    if changed then
        fw_uci:commit("firewall")
    end
    return changed
end

-- Remove "wan6" from the wan firewall zone's network list (cleanup on disable)
local function remove_wan6_from_firewall()
    local fw_uci = new_uci()
    fw_uci:set_confdir("/etc/config")
    local changed = false
    fw_uci:foreach("firewall", "zone", function(s)
        if s.name == "wan" then
            local nets = s.network or {}
            if type(nets) == "string" then nets = {nets} end
            local new_nets = {}
            for _, v in ipairs(nets) do
                if v == "wan6" then changed = true else new_nets[#new_nets+1] = v end
            end
            if changed then
                fw_uci:set("firewall", s[".name"], "network", new_nets)
            end
            return false
        end
    end)
    if changed then fw_uci:commit("firewall") end
    return changed
end

local get_wan_info  -- forward declaration (defined below; used by find_wan_iface)

local function find_wan_iface()
    local info = get_wan_info()
    if info.iface and info.iface ~= "" then
        local uci = new_uci()
        if uci:get("network", info.iface) ~= nil then
            return info.iface
        end
    end
    local uci   = new_uci()
    local found = "wan"
    uci:foreach("network", "interface", function(s)
        local name = s[".name"]
        if name == "loopback" or name == "lan" then return end
        if name == "wan" then found = "wan"; return false end
        if name:match("^wan") then found = name end
    end)
    return found
end

local function read_sysfs(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local v = f:read("*l"); f:close()
    return v and v:match("^%s*(.-)%s*$") or nil
end

local function read_default_gw()
    local f = io.open("/proc/net/route", "r")
    if not f then return nil end
    f:read("*l")
    for line in f:lines() do
        local dest, gw = line:match("^%S+%s+(%S+)%s+(%S+)")
        if dest == "00000000" and gw and gw ~= "00000000" then
            f:close()
            local n = tonumber(gw, 16)
            if n then
                return string.format("%d.%d.%d.%d",
                    n % 256,
                    math.floor(n / 256)      % 256,
                    math.floor(n / 65536)    % 256,
                    math.floor(n / 16777216) % 256)
            end
        end
    end
    f:close()
    return nil
end

local function file_exists(path)
    local f = io.open(path, "r")
    if not f then return false end
    f:close(); return true
end

local function hex_le_to_ip(hex)
    if not hex or #hex ~= 8 then return nil end
    local p1, p2, p3, p4 = hex:match("(%x%x)(%x%x)(%x%x)(%x%x)")
    if not p4 then return nil end
    return string.format("%d.%d.%d.%d",
        tonumber(p4, 16), tonumber(p3, 16), tonumber(p2, 16), tonumber(p1, 16))
end

local function read_proc_route()
    local gateway_ips, default_dev = {}, nil
    local f = io.open("/proc/net/route", "r")
    if not f then return gateway_ips, default_dev end
    for line in f:lines() do
        local iface, dest, gw = line:match("^%s*(%S+)%s+(%S+)%s+(%S+)")
        if iface and dest and gw and dest ~= "Destination" then
            if dest == "00000000" and gw ~= "00000000" then
                local ip = hex_le_to_ip(gw)
                if ip then gateway_ips[ip] = true end
                if not default_dev then default_dev = iface end
            end
        end
    end
    f:close()
    return gateway_ips, default_dev
end

local function find_uplink_port(bridge_name)
    if not bridge_name or bridge_name == "" then return nil end
    local gateway_ips = read_proc_route()
    if not gateway_ips or not next(gateway_ips) then return nil end
    local gw_mac = nil
    local arp_f = io.open("/proc/net/arp", "r")
    if arp_f then
        for line in arp_f:lines() do
            local ip, flags, mac = line:match("^%s*(%S+)%s+%S+%s+(%S+)%s+(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)")
            if ip and mac and flags and gateway_ips[ip] then
                local fl = tonumber(flags, 16) or 0
                if fl ~= 0 then gw_mac = mac:lower(); break end
            end
        end
        arp_f:close()
    end
    if not gw_mac then return nil end
    local fdb = exec("bridge fdb show br " .. bridge_name .. " 2>/dev/null") or ""
    for line in fdb:gmatch("[^\r\n]+") do
        local mac, dev = line:match("^(%x%x:%x%x:%x%x:%x%x:%x%x:%x%x)%s+dev%s+(%S+)")
        if mac and dev and mac:lower() == gw_mac then
            if file_exists("/sys/class/net/" .. bridge_name .. "/brif/" .. dev) then
                return dev
            end
        end
    end
    return nil
end

local WAN_PROTOS = {
    pppoe=true, dhcp=true, static=true, pppoa=true,
    pptp=true, l2tp=true, wwan=true, qmi=true, mbim=true,
    dhcpv6=true,
}

local function detect_wan_iface_ubus(conn)
    if not conn then return nil end
    local ok_objs, objs = pcall(function() return conn:objects() end)
    if not ok_objs or not objs then return nil end
    for _, obj in ipairs(objs) do
        local logical = obj:match("^network%.interface%.(.+)$")
        if logical then
            local lname = logical:lower()
            if lname ~= "loopback"
               and not lname:match("^lan")
               and not lname:match("^br")
               and not lname:match("^wg") then
                local ok, status = pcall(function()
                    return conn:call("network.interface." .. logical, "status", {})
                end)
                if ok and status then
                    local proto = (type(status.proto) == "string") and status.proto:lower() or ""
                    if WAN_PROTOS[proto] then
                        local l3 = status.l3_device or status.device or ""
                        local dev = status.device or status.l3_device or ""
                        if l3 ~= "" and dev ~= "" then
                            return { logical=logical, l3_device=l3, device=dev,
                                     proto=proto, up=(status.up == true) }
                        end
                    end
                end
            end
        end
    end
    local _, default_dev = read_proc_route()
    if default_dev then
        for _, obj in ipairs(objs) do
            local logical = obj:match("^network%.interface%.(.+)$")
            if logical then
                local ok, status = pcall(function()
                    return conn:call("network.interface." .. logical, "status", {})
                end)
                if ok and status and (status.device == default_dev or status.l3_device == default_dev) then
                    local proto = (type(status.proto) == "string") and status.proto:lower() or ""
                    local l3 = status.l3_device or status.device or ""
                    local dev = status.device or status.l3_device or ""
                    return { logical=logical, l3_device=l3, device=dev,
                             proto=proto, up=(status.up == true) }
                end
            end
        end
    end
    return nil
end

function get_wan_info()
    local info = { iface="wan", l3_device="", phys_device="", proto="", up=false }
    local ok_ub, conn = pcall(ubus.connect)
    if ok_ub and conn then
        local ok_w, wan = pcall(function()
            return conn:call("network.interface.wan", "status", {})
        end)
        if ok_w and wan and wan.proto then
            info.iface = "wan"
            info.proto = (wan.proto:lower() == "dhcpv6") and "dhcp" or wan.proto:lower()
            info.up = (wan.up == true)
            info.l3_device = wan.l3_device or wan.device or ""
            info.phys_device = wan.device or wan.l3_device or ""
        else
            local detected = detect_wan_iface_ubus(conn)
            if detected then
                info.iface = detected.logical
                info.proto = (detected.proto == "dhcpv6") and "dhcp" or detected.proto
                info.up = detected.up
                info.l3_device = detected.l3_device
                info.phys_device = detected.device
            end
        end
        pcall(function() conn:close() end)
    end
    if info.phys_device ~= "" then
        if file_exists("/sys/class/net/" .. info.phys_device .. "/brport") then
            local link = (nixio_fs and nixio_fs.readlink)
                and nixio_fs.readlink("/sys/class/net/" .. info.phys_device .. "/brport/bridge")
                or nil
            if link then
                local bn = link:match("([^/]+)$")
                if bn and bn ~= "" then
                    info.phys_device = bn
                    local uplink = find_uplink_port(bn)
                    if uplink then info.phys_device = uplink end
                end
            end
        end
        elseif file_exists("/sys/class/net/" .. info.phys_device .. "/bridge") then
            local bn = info.phys_device
            info.phys_device = bn
            local uplink = find_uplink_port(bn)
            if uplink then info.phys_device = uplink end
        end
    if info.proto == "" then
        local uci = new_uci()
        local uci_proto = uci_str(uci, "network", info.iface, "proto")
        if uci_proto then
            info.proto = (uci_proto:lower() == "dhcpv6") and "dhcp" or uci_proto:lower()
        end
    end
    return info
end

-- Forkless ICMP echo (raw socket); returns true on reply, nil on failure.
-- Falls back to the ping binary in ping_online() when nixio is unavailable.
local function nixio_ping(host, timeout_sec)
    if not NIXIO_PING_OK then return nil end
    local bit = nixio.bit

    local sock = nixio.socket("inet", "raw", "icmp")
    if not sock then
        NIXIO_PING_OK = false
        return nil
    end

    sock:setsockopt("socket", "rcvtimeo", timeout_sec or 2, 0)

    local id  = (nixio.getpid and nixio.getpid()) or 1
    local seq = 1
    local payload = string.rep("x", 16)

    local pkt = string.char(8, 0, 0, 0)
        .. string.char(bit.band(bit.rshift(id, 8), 0xFF), bit.band(id, 0xFF))
        .. string.char(0, seq)
        .. payload

    local sum = 0
    for i = 1, #pkt - 1, 2 do
        sum = sum + pkt:byte(i) * 256 + pkt:byte(i + 1)
    end
    if #pkt % 2 == 1 then
        sum = sum + pkt:byte(#pkt) * 256
    end
    while bit.rshift(sum, 16) > 0 do
        sum = bit.band(sum, 0xFFFF) + bit.rshift(sum, 16)
    end
    local cksum = bit.band(bit.bnot(sum), 0xFFFF)

    pkt = string.char(8, 0,
            bit.band(bit.rshift(cksum, 8), 0xFF), bit.band(cksum, 0xFF))
        .. string.char(bit.band(bit.rshift(id, 8), 0xFF), bit.band(id, 0xFF))
        .. string.char(0, seq)
        .. payload

    local sent = sock:sendto(pkt, host, 0)
    if not sent then
        sock:close()
        return nil
    end

    local resp = sock:recv(1024)
    sock:close()

    if not resp or #resp < 28 then return nil end

    local ihl = bit.band(resp:byte(1), 0x0F) * 4
    if ihl < 20 or #resp < ihl + 8 then return nil end
    if resp:byte(ihl + 1) ~= 0 then return nil end

    local resp_id = resp:byte(ihl + 5) * 256 + resp:byte(ihl + 6)
    if resp_id ~= id then return nil end

    return true
end

local function ping_online(wan_iface)
    if nixio_ping("1.1.1.1", 2) then return true end
    if nixio_ping("9.9.9.9", 2) then return true end
    local iface_flag = (wan_iface and wan_iface ~= "") and ("-I " .. wan_iface .. " ") or ""
    if cmd_ok("ping " .. iface_flag .. "-c1 -W2 -w2 1.1.1.1 >/dev/null 2>&1") then return true end
    return cmd_ok("ping " .. iface_flag .. "-c1 -W2 -w2 9.9.9.9 >/dev/null 2>&1")
end

local function format_uptime(seconds)
    if not seconds or seconds < 0 then return "-" end
    seconds = math.floor(seconds)
    if seconds < 60 then
        return seconds .. "s"
    elseif seconds < 3600 then
        return math.floor(seconds / 60) .. "m"
    elseif seconds < 86400 then
        return math.floor(seconds / 3600) .. "h"
    else
        return math.floor(seconds / 86400) .. "d"
    end
end

local function get_wan_devices()
    local devices = {}
    local devs_seen = {}

    local function is_virtual(dev)
        local virtual_prefixes = {
            "lo", "br%-", "tun", "tap", "ppp", "sit", "gre",
            "ip6", "ifb", "dummy", "veth", "vlan", "wlan", "phy",
            "imq", "teql", "bond", "team", "ovs%-", "virbr",
        }
        for _, pat in ipairs(virtual_prefixes) do
            if dev:match("^" .. pat) then return true end
        end
        if dev:match("%.[0-9]+$") then return true end
        return false
    end

    local function is_physical(dev)
        if is_virtual(dev) then return false end
        local f = io.open("/sys/class/net/" .. dev .. "/device", "r")
        if not f then return false end
        f:close(); return true
    end

    local devlist = table.concat(list_dir("/sys/class/net"), "\n")
    if devlist then
        for dev in devlist:gmatch("[^\n]+") do
            if dev ~= "" and not devs_seen[dev] and is_physical(dev) then
                devs_seen[dev] = true
                devices[#devices+1] = dev
            end
        end
    end

    if #devices == 0 then
        for _, dev in ipairs({"eth0", "eth1", "eth2", "eth3", "wan", "wwan0", "usb0"}) do
            if not devs_seen[dev] and is_physical(dev) then
                devs_seen[dev] = true
                devices[#devices+1] = dev
            end
        end
    end

    table.sort(devices)
    return devices
end

local function get_wan_uptime(iface)
    local ok_ub, conn = pcall(ubus.connect)
    if ok_ub and conn then
        local ok2, wan = pcall(function()
            return conn:call("network.interface." .. iface, "status", {})
        end)
        if ok2 and wan and wan.uptime then
            pcall(function() conn:close() end)
            return format_uptime(tonumber(wan.uptime))
        end
        pcall(function() conn:close() end)
    end
    return "-"
end

local function wan_port_state(iface)
    if not iface or iface == "" then return "not_configured" end
    local uci2 = new_uci()
    local proto = uci2:get("network", iface, "proto")
    local cfg_device = uci_str(uci2, "network", iface, "device") or ""
    local info = get_wan_info()
    if not proto and info.l3_device == "" and info.phys_device == "" then
        return "not_configured"
    end
    local devs = {}
    local seen = {}
    local function add_dev(d)
        if d and d ~= "" and not seen[d] then seen[d] = true; devs[#devs+1] = d end
    end
    add_dev("ppp0")
    add_dev("pppoe-" .. iface)
    add_dev(info.l3_device)
    add_dev(info.phys_device)
    add_dev(cfg_device)
    add_dev(iface)
    add_dev("eth1")
    add_dev("eth0.2")
    add_dev("eth0")
    for _, dev in ipairs(devs) do
        local carrier = read_sysfs("/sys/class/net/" .. dev .. "/carrier")
        if carrier == "1" then return "connected" end
        if carrier == "0" then return "disconnected" end
    end
    for _, dev in ipairs(devs) do
        local s = read_sysfs("/sys/class/net/" .. dev .. "/operstate")
        if s == "up" then return "connected" end
    end
    return "disconnected"
end

local function gen_from_htmode(htmode)
    if not htmode or htmode == "" then return nil end
    local h = htmode:upper()
    if     h:find("^EHT") then return "11be"
    elseif h:find("^HE")  then return "11ax"
    elseif h:find("^VHT") then return "11ac"
    elseif h:find("^HT")  then return "11n"
    else                        return "legacy" end
end

local function find_radios(uci)
    local radios = {}
    uci:foreach("wireless", "wifi-device", function(dev)
        local name = dev[".name"]
        local band = (dev.band or ""):lower()
        if band ~= "2g" and band ~= "5g" and band ~= "6g" then
            local hw = (dev.hwmode or ""):lower()
            if hw == "11a" or hw == "11na" or hw == "11ac" or
               hw == "11ax" or hw:find("5g") then
                band = "5g"
            else
                band = "2g"
            end
        end
        local ifaces = {}
        local smart_ifaces = {}
        uci:foreach("wireless", "wifi-iface", function(iface)
            if iface.device == name and iface.mode == "ap"
               and iface.network ~= "guest_zone" then
                if iface.is_smart_ap == "1" then
                    smart_ifaces[#smart_ifaces+1] = iface[".name"]
                else
                    ifaces[#ifaces+1] = iface[".name"]
                end
            end
        end)
        if #ifaces == 0 then
            uci:foreach("wireless", "wifi-iface", function(iface)
                if iface.device == name and iface.network ~= "guest_zone"
                   and iface.is_smart_ap ~= "1"
                   and #ifaces == 0 then
                    ifaces[1] = iface[".name"]
                end
            end)
        end
        local band_key = band
        if radios[band_key] then
            local n = 2
            while radios[band .. "_" .. n] do n = n + 1 end
            band_key = band .. "_" .. n
        end
        radios[band_key] = { radio_sec = name, ifaces = ifaces, smart_ifaces = smart_ifaces }
    end)
    return radios
end

local function read_uci_radio(uci, radio_sec)
    local htmode = uci_str(uci, "wireless", radio_sec, "htmode") or ""
    local wifi_gen = gen_from_htmode(htmode)
    if not wifi_gen or wifi_gen == "legacy" then
        local band   = (uci_str(uci, "wireless", radio_sec, "band")   or ""):lower()
        local hwmode = (uci_str(uci, "wireless", radio_sec, "hwmode") or ""):lower()
        if     hwmode == "11be"                        then wifi_gen = "11be"
        elseif hwmode == "11ax" or hwmode == "11ax_6g" then wifi_gen = "11ax"
        elseif hwmode == "11ac"                        then wifi_gen = "11ac"
        elseif hwmode == "11n"  or hwmode == "11na"    then wifi_gen = "11n"
        elseif band == "5g"                            then wifi_gen = "11ac"
        else                                                wifi_gen = "11n" end
    end
    if htmode == "" then
        local def = {["11n"]="HT20",["11ac"]="VHT80",["11ax"]="HE80",["11be"]="EHT80"}
        htmode = def[wifi_gen] or "HT20"
    end
    return {
        radio_sec = radio_sec,
        channel   = uci_str(uci, "wireless", radio_sec, "channel") or "auto",
        txpower   = uci_str(uci, "wireless", radio_sec, "txpower") or "",
        country   = uci_str(uci, "wireless", radio_sec, "country") or "",
        htmode    = htmode,
        wifi_gen  = wifi_gen,
        band      = (uci_str(uci, "wireless", radio_sec, "band") or ""):lower(),
        noscan    = uci_str(uci, "wireless", radio_sec, "noscan") or "0",
        disabled  = uci_str(uci, "wireless", radio_sec, "disabled") or "0",
    }
end

local function read_uci_iface(uci, iface_sec, radio_disabled)
    local iface_disabled = uci_str(uci, "wireless", iface_sec, "disabled") or "0"
    return {
        iface_sec = iface_sec,
        ssid      = uci_str(uci, "wireless", iface_sec, "ssid")       or "",
        enc       = uci_str(uci, "wireless", iface_sec, "encryption") or "none",
        key       = uci_str(uci, "wireless", iface_sec, "key")        or "",
        hidden         = uci_str(uci, "wireless", iface_sec, "hidden")         or "0",
        disabled       = ((radio_disabled == "1") or (iface_disabled == "1")) and "1" or "0",
        bss_transition = uci_str(uci, "wireless", iface_sec, "bss_transition") or "0",
        ieee80211k     = uci_str(uci, "wireless", iface_sec, "ieee80211k")     or "0",
        isolate        = uci_str(uci, "wireless", iface_sec, "isolate")        or "0",
        network        = uci_str(uci, "wireless", iface_sec, "network")        or "lan",
        wnm_sleep_mode = uci_str(uci, "wireless", iface_sec, "wnm_sleep_mode") or "0",
        is_smart_ap   = uci_str(uci, "wireless", iface_sec, "is_smart_ap") or "0",
    }
end

local function get_live_wan_ip(proto, iface, ipaddr, gateway)
    local ip, gw = "-", "-"
    local ubus_up = false
    local ubus_available = false

    local ok_ub, conn = pcall(ubus.connect)
    if ok_ub and conn then
        ubus_available = true
        local ok2, wan = pcall(function()
            return conn:call("network.interface." .. iface, "status", {})
        end)
        if ok2 and wan then
            if wan.up == true then
                ubus_up = true
                local addrs = wan["ipv4-address"]
                if type(addrs) == "table" and addrs[1] then ip = addrs[1].address or "-" end
                local routes = wan.route
                if type(routes) == "table" and routes[1] then gw = routes[1].nexthop or "-" end
            end
        end
        pcall(function() conn:close() end)
    end

    if ip == "-" and (not ubus_available or not ubus_up) then
        local v = read_sysfs("/tmp/network/interface/" .. iface .. "/ipaddr")
               or read_sysfs("/tmp/network/interface/" .. iface .. "/address")
        if v and v ~= "" then ip = v end
    end
    if gw == "-" then gw = read_default_gw() or "-" end

    if proto == "static" and not ubus_available then
        if ip == "-" and ipaddr  ~= "" then ip = ipaddr  end
        if gw == "-" and gateway ~= "" then gw = gateway end
    end
    return ip, gw
end

local function hw_max_from_info(info, wifi_gen_fallback)
    local hw_max
    if info then
        local modes = info.hwmodes or {}
        if type(modes) == "table" then
            for _, m in ipairs(modes) do
                m = tostring(m):lower()
                if     m == "be" or m == "11be" then hw_max = "11be"; break
                elseif m == "ax" or m == "11ax" then if hw_max ~= "11be" then hw_max = "11ax" end
                elseif m == "ac" or m == "11ac" then if not hw_max then hw_max = "11ac" end
                elseif m == "n"  or m == "11n"  then if not hw_max then hw_max = "11n" end
                end
            end
        end
        if not hw_max then
            local htm = info.htmodes or {}
            if type(htm) == "table" then
                for _, h in ipairs(htm) do
                    h = tostring(h):upper()
                    if     h:find("^EHT") then hw_max = "11be"; break
                    elseif h:find("^HE")  then hw_max = "11ax"
                    elseif h:find("^VHT") then if not hw_max then hw_max = "11ac" end
                    elseif h:find("^HT")  then if not hw_max then hw_max = "11n" end
                    end
                end
            end
        end
    end
    return hw_max or wifi_gen_fallback or "11n"
end

local function detect_hw_max(radio_name, wifi_gen_fallback)
    local info
    local ok_ub, conn = pcall(ubus.connect)
    if ok_ub and conn then
        local ok2, result = pcall(function()
            return conn:call("iwinfo", "info", { device = radio_name })
        end)
        if ok2 then info = result end
        pcall(function() conn:close() end)
    end
    return hw_max_from_info(info, wifi_gen_fallback)
end

-- Detect whether the running system can actually serve WPA3 (SAE) APs.
-- WPA3 requires a full wpad/hostapd build; the wpad-basic/wpad-mini/wpa-basic
-- variants are compiled without SAE and cannot do WPA3. opkg metadata is often
-- absent on custom builds, so we probe the daemon binary directly for SAE
-- capability strings (compiled out of the basic/mini variants) and fall back
-- to opkg package names when the binaries are missing. Result is cached for
-- the lifetime of this rpcd invocation.
local WPA3_CACHE_FILE = "/tmp/easy_setup/wpa3_support"
local _wpa3_cache
local function detect_wpa3_support()
    if _wpa3_cache ~= nil then return _wpa3_cache end

    local cached = io.open(WPA3_CACHE_FILE, "r")
    if cached then
        local value = cached:read("*l")
        cached:close()
        if value == "1" or value == "0" then
            _wpa3_cache = (value == "1")
            return _wpa3_cache
        end
    end

    local function save_cache(value)
        if nixio_fs and nixio_fs.mkdirr then
            pcall(nixio_fs.mkdirr, "/tmp/easy_setup")
        end
        if not file_exists("/tmp/easy_setup") then
            os.execute("mkdir -p /tmp/easy_setup 2>/dev/null")
        end
        local f = io.open(WPA3_CACHE_FILE, "w")
        if f then f:write(value and "1\n" or "0\n"); f:close() end
        _wpa3_cache = value
        return value
    end

    local scanned = {}
    local function bin_has_sae(path)
        if not path or path == "" or not file_exists(path) then return false end
        -- Resolve symlinks (e.g. hostapd -> wpad) to avoid scanning twice.
        if nixio_fs and nixio_fs.readlink then
            local link = nixio_fs.readlink(path)
            if link and link ~= "" then
                if link:sub(1, 1) ~= "/" then
                    local dir = path:match("^(.*)/[^/]+$") or "/usr/sbin"
                    link = dir .. "/" .. link
                end
                if file_exists(link) then path = link end
            end
        end
        if scanned[path] then return false end
        scanned[path] = true
        -- grep is universally available (busybox grep); -a forces text mode so
        -- binary content is scanned literally. sae_password / sae_pwe /
        -- sae_anti_clogging are present only in full SAE-capable builds.
        return cmd_ok("grep -qa -e sae_password -e sae_pwe -e sae_anti_clogging "
                     .. shell_quote(path) .. " 2>/dev/null")
    end
    if bin_has_sae("/usr/sbin/wpad") or bin_has_sae("/usr/sbin/hostapd") then
        return save_cache(true)
    end
    -- Fallback: opkg metadata (stock builds keep it under /usr/lib/opkg/info).
    for _, f in ipairs(list_dir("/usr/lib/opkg/info")) do
        if f:match("^wpad%-basic") or f:match("^wpad%-mini")
           or f:match("^wpa%-basic") or f:match("^wpa%-mini") then
            return save_cache(false)
        end
        if f:match("^wpad%.") or f:match("^wpad%-mbedtls") or f:match("^hostapd%.") then
            return save_cache(true)
        end
    end
    return save_cache(false)
end

local function detect_wan_port(uci, configured_device)
    if configured_device and configured_device ~= "" then
        return configured_device
    end

    local function read_sysfs_val(path)
        local f = io.open(path, "r")
        if not f then return nil end
        local v = f:read("*l"); f:close()
        return v and v:match("^%s*(.-)%s*$") or nil
    end

    local function is_virtual(dev)
        local vp = {"lo","br%-","tun","tap","ppp","sit","gre","ip6","ifb",
                    "dummy","veth","bond","team","ovs%-","wlan","phy"}
        for _, p in ipairs(vp) do if dev:match("^"..p) then return true end end
        if dev:match("%.[0-9]+$") then return true end
        return false
    end

    local function is_physical(dev)
        if is_virtual(dev) then return false end
        local f = io.open("/sys/class/net/" .. dev .. "/device", "r")
        if not f then return false end
        f:close(); return true
    end

    local physical = {}
    local phys_set = {}
    local devlist = table.concat(list_dir("/sys/class/net"), "\n")
    if devlist then
        for dev in devlist:gmatch("[^\n]+") do
            if dev ~= "" and is_physical(dev) then
                physical[#physical+1] = dev
                phys_set[dev] = true
            end
        end
    end
    if #physical == 0 then return "" end
    table.sort(physical)

    local lan_members = {}
    uci:foreach("network", "interface", function(s)
        if s[".name"] == "lan" then
            local ports = s.ports or s.ifname or ""
            if type(ports) == "table" then
                for _, p in ipairs(ports) do lan_members[p] = true end
            else
                for p in tostring(ports):gmatch("%S+") do lan_members[p] = true end
            end
            local br = s.device or s.ifname or "br-lan"
            local f2 = io.open("/sys/class/net/"..br.."/brif", "r")
            if not f2 then
                for _, mem in ipairs(list_dir("/sys/class/net/"..br.."/brif")) do
                    lan_members[mem] = true
                end
            end
        end
    end)

    local wan_from_switch = nil
    local switch_devs = {}
    uci:foreach("network", "switch_vlan", function(sv)
        local ports_str = sv.ports or ""
        local non_cpu = {}
        local has_cpu = false
        for p in ports_str:gmatch("%S+") do
            if p:match("t$") or p:match("u$") then
                has_cpu = true
            else
                local pn = tonumber(p)
                if pn then non_cpu[#non_cpu+1] = pn end
            end
        end
        for p in ports_str:gmatch("%S+") do
            local pn = p:match("^(%d+)t")
            if pn then has_cpu = true end
        end
        if has_cpu and #non_cpu == 1 then
            local vlan_id = sv.vlan or sv[".name"]
            local sw_dev  = sv.device or "switch0"
            switch_devs[#switch_devs+1] = {
                vlan = vlan_id,
                sw   = sw_dev,
                port = non_cpu[1]
            }
        end
    end)
    if #switch_devs == 1 then
        local vlan_id = switch_devs[1].vlan
        uci:foreach("network", "interface", function(s)
            local dev = s.device or s.ifname or ""
            if dev:match("%."..tostring(vlan_id).."$") then
                local parent = dev:match("^(.-)%.")
                if parent and phys_set[parent] and not lan_members[parent] then
                    wan_from_switch = parent
                    return false
                end
                if phys_set[dev] and not lan_members[dev] then
                    wan_from_switch = dev
                    return false
                end
            end
        end)
    end
    if wan_from_switch then return wan_from_switch end

    local best_carrier = nil
    local best_rx = -1
    for _, dev in ipairs(physical) do
        if not lan_members[dev] then
            local carrier = read_sysfs_val("/sys/class/net/"..dev.."/carrier")
            local rx = tonumber(read_sysfs_val("/sys/class/net/"..dev.."/statistics/rx_bytes")) or 0
            if carrier == "1" then
                if rx > best_rx then
                    best_rx = rx
                    best_carrier = dev
                end
            end
        end
    end
    if best_carrier then return best_carrier end

    local best_traffic = nil
    local best_traffic_rx = 0
    for _, dev in ipairs(physical) do
        if not lan_members[dev] then
            local rx = tonumber(read_sysfs_val("/sys/class/net/"..dev.."/statistics/rx_bytes")) or 0
            if rx > best_traffic_rx then
                best_traffic_rx = rx
                best_traffic = dev
            end
        end
    end
    if best_traffic and best_traffic_rx > 0 then return best_traffic end

    for _, dev in ipairs(physical) do
        if dev == "wan" and not lan_members[dev] then return dev end
    end
    for _, dev in ipairs(physical) do
        if dev:match("^wan") and not lan_members[dev] then return dev end
    end
    for _, dev in ipairs(physical) do
        if dev == "eth0" and not lan_members[dev] then return dev end
    end
    for _, dev in ipairs(physical) do
        if dev:match("^eth") and not lan_members[dev] then return dev end
    end
    for _, dev in ipairs(physical) do
        if not lan_members[dev] then return dev end
    end
    return physical[1] or ""
end

local function safe_hwmode(band)
    if band == "6g" then return nil end
    if band == "5g" then return "11a" end
    return "11g"
end

local function find_free_guest_subnet(uci)
    local used = {}
    uci:foreach("network", "interface", function(s)
        local ip = s.ipaddr or ""
        if type(ip) == "string" then
            local bare   = ip:match("^(%d+%.%d+%.%d+%.%d+)") or ip
            local prefix = bare:match("^(%d+%.%d+%.%d+%.)")
            if prefix then used[prefix] = true end
        end
    end)
    for i = 2, 50 do
        local prefix = "192.168." .. i .. "."
        if not used[prefix] then
            return "192.168." .. i .. ".1"
        end
    end
    return "192.168.100.1"
end

local function setup_guest_firewall()
    local fw      = new_uci()
    local changed = false

    local zone_sec = nil
    fw:foreach("firewall", "zone", function(s)
        if s.name == "guest_zone" then zone_sec = s[".name"]; return false end
    end)
    if not zone_sec then
        zone_sec = fw:add("firewall", "zone")
        fw:set("firewall", zone_sec, "name",    "guest_zone")
        fw:set("firewall", zone_sec, "input",   "REJECT")
        fw:set("firewall", zone_sec, "output",  "ACCEPT")
        fw:set("firewall", zone_sec, "forward", "REJECT")
        fw:set("firewall", zone_sec, "network", "guest_zone")
        changed = true
    else
        local nets = fw:get("firewall", zone_sec, "network") or {}
        if type(nets) == "string" then nets = {nets} end
        local found = false
        for _, v in ipairs(nets) do if v == "guest_zone" then found = true end end
        if not found then
            nets[#nets+1] = "guest_zone"
            fw:set("firewall", zone_sec, "network", nets)
            changed = true
        end
    end

    local has_dhcp = false
    fw:foreach("firewall", "rule", function(s)
        if s.name == "Allow-DHCP-Guest" then has_dhcp = true; return false end
    end)
    if not has_dhcp then
        local r = fw:add("firewall", "rule")
        fw:set("firewall", r, "name",      "Allow-DHCP-Guest")
        fw:set("firewall", r, "src",       "guest_zone")
        fw:set("firewall", r, "proto",     "udp")
        fw:set("firewall", r, "dest_port", "67-68")
        fw:set("firewall", r, "target",    "ACCEPT")
        changed = true
    end

    local has_dns = false
    fw:foreach("firewall", "rule", function(s)
        if s.name == "Allow-DNS-Guest" then has_dns = true; return false end
    end)
    if not has_dns then
        local r = fw:add("firewall", "rule")
        fw:set("firewall", r, "name",      "Allow-DNS-Guest")
        fw:set("firewall", r, "src",       "guest_zone")
        fw:set("firewall", r, "proto",     "tcp udp")
        fw:set("firewall", r, "dest_port", "53")
        fw:set("firewall", r, "target",    "ACCEPT")
        changed = true
    end

    local has_fwd = false
    fw:foreach("firewall", "forwarding", function(s)
        if s.src == "guest_zone" and s.dest == "wan" then has_fwd = true; return false end
    end)
    if not has_fwd then
        local f = fw:add("firewall", "forwarding")
        fw:set("firewall", f, "src",  "guest_zone")
        fw:set("firewall", f, "dest", "wan")
        changed = true
    end

    if changed then
        fw:commit("firewall")
        exec("/etc/init.d/firewall reload 2>/dev/null &")
    end
    return changed
end

local function setup_guest_dhcp(uci)
    local dhcp_sec = nil
    uci:foreach("dhcp", "dhcp", function(s)
        if s.interface == "guest_zone" then dhcp_sec = s[".name"]; return false end
    end)
    if not dhcp_sec then
        dhcp_sec = uci:add("dhcp", "dhcp")
        uci:set("dhcp", dhcp_sec, "interface", "guest_zone")
        uci:set("dhcp", dhcp_sec, "start",     "100")
        uci:set("dhcp", dhcp_sec, "limit",     "150")
        uci:set("dhcp", dhcp_sec, "leasetime", "1h")
        local ok = pcall(function() uci:commit("dhcp") end)
        if ok then
            exec("/etc/init.d/dnsmasq reload 2>/dev/null &")
        end
    end
end

-- ════════════════════════════════════════════════════════════════════════════
--  Handler functions (ported from action_*)
-- ════════════════════════════════════════════════════════════════════════════

local function handle_get_smart_ap_config()
    local ok, err = pcall(function()
        local uci = new_uci()
        local radios = find_radios(uci)
        local smart_ssids = {}

        local seen = {}
        local ap_map = {}

        uci:foreach("wireless", "wifi-iface", function(s)
            local ssid = s.ssid or ""
            local key  = s.key or ""
            local net  = s.network or "lan"
            local mode = s.mode or "ap"
            local is_smart = s.is_smart_ap == "1"

            if ssid ~= "" and net == "lan" and mode == "ap" then
                if is_smart then
                    if not seen[ssid] then
                        seen[ssid] = {
                            ssid = ssid,
                            encryption = s.encryption or "none",
                            key = key,
                            hidden = s.hidden or "0",
                            disabled = s.disabled or "0",
                            isolate = s.isolate or "0",
                            bss_transition = s.bss_transition or "0",
                            ieee80211k = s.ieee80211k or "0",
                            network = net,
                            wnm_sleep_mode = s.wnm_sleep_mode or "0",
                            radios = {}
                        }
                        table.insert(smart_ssids, seen[ssid])
                    end
                    table.insert(seen[ssid].radios, s.device)
                else
                    local k = ssid .. "||" .. key
                    if not ap_map[k] then ap_map[k] = { ssid=ssid, key=key, interfaces={} } end
                    local ifd = read_uci_iface(uci, s[".name"], "0")
                    for b, r in pairs(radios) do
                        if r.radio_sec == s.device then ifd.band = b; break end
                    end
                    table.insert(ap_map[k].interfaces, ifd)
                end
            end
        end)

        local smart_candidates = {}
        for k, group in pairs(ap_map) do
            if #group.interfaces > 1 then
                local first = group.interfaces[1]
                local mismatch = false
                for i=2, #group.interfaces do
                    local cur = group.interfaces[i]
                    if cur.enc ~= first.enc or cur.hidden ~= first.hidden or
                       cur.isolate ~= first.isolate or cur.bss_transition ~= first.bss_transition or
                       cur.ieee80211k ~= first.ieee80211k or cur.wnm_sleep_mode ~= first.wnm_sleep_mode then
                        mismatch = true; break
                    end
                end
                group.mismatch = mismatch
                table.insert(smart_candidates, group)
            end
        end

        local wpad_mini = false
        for _, f in ipairs(list_dir("/usr/lib/opkg/info")) do
            if f:match("^wpad%-basic") or f:match("^wpad%-mini") then
                wpad_mini = true
                break
            end
        end

        respond({
            success = true,
            ssids = smart_ssids,
            candidates = smart_candidates,
            radios = radios,
            wpad_mini = wpad_mini,
            wpa3_supported = detect_wpa3_support(),
            countries = WIFI_COUNTRIES
        })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_save_smart_ap()
    local ok, err = pcall(function()
        local uci = new_uci()
        local old_ssid = p("old_ssid")
        local ssid = p("ssid")
        local enc = p("enc") or "psk2"
        local key = p("key") or ""
        local hidden = p("hidden") or "0"
        local disabled = p("disabled") or "0"
        local isolate = p("isolate") or "0"
        local roam = p("roam") or "0"
        local wnm = p("wnm") or "0"
        local is_candidate = p("is_candidate") == "1"

        if not ssid or ssid == "" then
            respond({ success = false, message = "SSID is required" })
            return
        end

        if (old_ssid and old_ssid ~= "") or is_candidate then
            uci:foreach("wireless", "wifi-iface", function(s)
                local match = false
                if is_candidate then
                    if s.network == "lan" and s.mode == "ap" and s.ssid == ssid then
                        match = true
                    end
                elseif s.network == "lan" and s.mode == "ap" and s.is_smart_ap == "1" and s.ssid == old_ssid then
                    match = true
                end

                if match then
                    local sec = s[".name"]
                    uci:set("wireless", sec, "ssid", ssid)
                    uci:set("wireless", sec, "encryption", enc)
                    if enc ~= "none" then uci:set("wireless", sec, "key", key)
                    else uci:delete("wireless", sec, "key") end
                    if hidden == "1" then uci:set("wireless", sec, "hidden", "1")
                    else uci:delete("wireless", sec, "hidden") end
                    if disabled == "1" then uci:set("wireless", sec, "disabled", "1")
                    else uci:delete("wireless", sec, "disabled") end
                    if isolate == "1" then uci:set("wireless", sec, "isolate", "1")
                    else uci:delete("wireless", sec, "isolate") end
                    if roam == "1" then
                        uci:set("wireless", sec, "ieee80211k", "1")
                        uci:set("wireless", sec, "bss_transition", "1")
                    else
                        uci:delete("wireless", sec, "ieee80211k")
                        uci:delete("wireless", sec, "bss_transition")
                    end
                    if wnm == "1" then uci:set("wireless", sec, "wnm_sleep_mode", "1")
                    else uci:delete("wireless", sec, "wnm_sleep_mode") end
                    uci:set("wireless", sec, "is_smart_ap", "1")
                end
            end)
        else
            local radios = find_radios(uci)
            for _, rdata in pairs(radios) do
                local rsec = rdata.radio_sec
                local base = ssid:lower():gsub("[^%w]", "_"):sub(1, 15) .. "_" .. rsec
                local new_sec = base
                uci:set("wireless", new_sec, "wifi-iface")
                uci:set("wireless", new_sec, "device", rsec)
                uci:set("wireless", new_sec, "network", "lan")
                uci:set("wireless", new_sec, "mode", "ap")
                uci:set("wireless", new_sec, "ssid", ssid)
                uci:set("wireless", new_sec, "encryption", enc)
                if enc ~= "none" then uci:set("wireless", new_sec, "key", key) end
                if hidden == "1" then uci:set("wireless", new_sec, "hidden", "1") end
                if disabled == "1" then uci:set("wireless", new_sec, "disabled", "1") end
                if isolate == "1" then uci:set("wireless", new_sec, "isolate", "1") end
                if roam == "1" then
                    uci:set("wireless", new_sec, "ieee80211k", "1")
                    uci:set("wireless", new_sec, "bss_transition", "1")
                end
                if wnm == "1" then uci:set("wireless", new_sec, "wnm_sleep_mode", "1") end
                uci:set("wireless", new_sec, "is_smart_ap", "1")
            end
        end

        local saved = uci:commit("wireless")
        if saved then exec("wifi reload 2>/dev/null &") end
        respond({ success = saved, message = saved and "Smart AP settings saved." or "Failed to save." })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_delete_smart_ap()
    local ok, err = pcall(function()
        local uci = new_uci()
        local ssid = p("ssid")
        if not ssid or ssid == "" then
            respond({ success = false, message = "SSID is required" })
            return
        end

        uci:foreach("wireless", "wifi-iface", function(s)
            if s.network == "lan" and s.mode == "ap" and s.is_smart_ap == "1" and s.ssid == ssid then
                uci:delete("wireless", s[".name"])
            end
        end)

        local saved = uci:commit("wireless")
        if saved then exec("wifi reload 2>/dev/null &") end
        respond({ success = saved, message = saved and "Smart AP SSID deleted." or "Failed to delete." })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_get_config()
    local ok, err = pcall(function()
        local uci   = new_uci()
        local iface = find_wan_iface()
        local include_wireless = p("scope") ~= "wan"

        local proto    = uci_str(uci, "network", iface, "proto")    or "dhcp"
        if proto == "dhcpv6" then proto = "dhcp" end
        local ipaddr   = uci_str(uci, "network", iface, "ipaddr")   or ""
        local netmask  = uci_str(uci, "network", iface, "netmask")  or ""
        local gateway  = uci_str(uci, "network", iface, "gateway")  or ""
        local username = uci_str(uci, "network", iface, "username") or ""
        local password = uci_str(uci, "network", iface, "password") or ""
        local mtu_uci  = uci_str(uci, "network", iface, "mtu")
        local mtu      = mtu_uci or ""
        local dns_raw  = uci_str(uci, "network", iface, "dns")      or ""
        local dns_list = {}
        for d in dns_raw:gmatch("%S+") do dns_list[#dns_list+1] = d end
        local peerdns_raw = uci_str(uci, "network", iface, "peerdns")
        local peerdns = (peerdns_raw ~= "0")
        if #dns_list == 0 then
            uci:foreach("network", "interface", function(s)
                if s[".name"] == iface and type(s.dns) == "table" then
                    for _, v in ipairs(s.dns) do dns_list[#dns_list+1] = v end
                end
            end)
        end

        local live_ip, live_gw = get_live_wan_ip(proto, iface, ipaddr, gateway)

        local live_mac = "-"
        local cfg_mac  = uci_str(uci, "network", iface, "macaddr") or ""
        local cfg_device = uci_str(uci, "network", iface, "device") or ""
        local wan_info = get_wan_info()
        local devs = {}
        local _seen = {}
        local function _add_dev(d)
            if d and d ~= "" and not _seen[d] then _seen[d] = true; devs[#devs+1] = d end
        end
        _add_dev("ppp0")
        _add_dev("pppoe-"..iface)
        _add_dev("ppp1")
        _add_dev(wan_info.l3_device)
        _add_dev(wan_info.phys_device)
        _add_dev(cfg_device)
        _add_dev(iface)
        _add_dev("eth1")
        _add_dev("eth0.2")
        _add_dev("eth0")
        for _, dev in ipairs(devs) do
            local m = read_sysfs("/sys/class/net/" .. dev .. "/address")
            if m and m ~= "" and m ~= "00:00:00:00:00:00" then live_mac = m:upper(); break end
        end

        local live_mtu = ""
        for _, dev in ipairs(devs) do
            local m = read_sysfs("/sys/class/net/" .. dev .. "/mtu")
            if m and m ~= "" then live_mtu = m; break end
        end

        local radios = find_radios(uci)

        local smart_candidates = {}
        local ap_map = {}
        local bands = {"2g", "5g", "5g_2", "6g"}
        for _, b in ipairs(bands) do
            local meta = radios[b]
            if meta then
                for _, iface_sec in ipairs(meta.ifaces) do
                    local ssid = uci_str(uci, "wireless", iface_sec, "ssid") or ""
                    local key  = uci_str(uci, "wireless", iface_sec, "key")  or ""
                    local net  = uci_str(uci, "wireless", iface_sec, "network") or "lan"
                    local mode = uci_str(uci, "wireless", iface_sec, "mode") or "ap"
                    if ssid ~= "" and net == "lan" and mode == "ap" then
                        local k = ssid .. "||" .. key
                        if not ap_map[k] then ap_map[k] = { ssid=ssid, key=key, interfaces={} } end
                        local ifd = read_uci_iface(uci, iface_sec, "0")
                        ifd.band = b
                        table.insert(ap_map[k].interfaces, ifd)
                    end
                end
            end
        end

        for k, group in pairs(ap_map) do
            if #group.interfaces > 1 then
                local first = group.interfaces[1]
                local mismatch = false
                for i=2, #group.interfaces do
                    local cur = group.interfaces[i]
                    if cur.enc ~= first.enc or cur.hidden ~= first.hidden or
                       cur.isolate ~= first.isolate or cur.bss_transition ~= first.bss_transition or
                       cur.ieee80211k ~= first.ieee80211k or cur.wnm_sleep_mode ~= first.wnm_sleep_mode then
                        mismatch = true; break
                    end
                end
                group.mismatch = mismatch
                table.insert(smart_candidates, group)
            end
        end

        local base_ssid = "OpenWrt"
        if radios["2g"] and radios["2g"].ifaces[1] then
            base_ssid = uci_str(uci, "wireless", radios["2g"].ifaces[1], "ssid") or "OpenWrt"
        end

        local function load_band(band_key, default_ssid_suffix)
            local meta = radios[band_key]
            if not meta then return nil end
            local radio = read_uci_radio(uci, meta.radio_sec)
            radio.hw_max = detect_hw_max(meta.radio_sec, radio.wifi_gen)
            local ifaces_data = {}
            for i, iface_sec in ipairs(meta.ifaces) do
                local ifd = read_uci_iface(uci, iface_sec, radio.disabled)
                if ifd.ssid == "" and i == 1 and default_ssid_suffix then
                    ifd.ssid = base_ssid .. default_ssid_suffix
                end
                ifaces_data[#ifaces_data+1] = ifd
            end
            -- Append Smart AP ifaces (read-only on the Access Points page).
            for _, iface_sec in ipairs(meta.smart_ifaces or {}) do
                local ifd = read_uci_iface(uci, iface_sec, radio.disabled)
                ifd.is_smart_ap = "1"
                ifaces_data[#ifaces_data+1] = ifd
            end
            radio.ifaces = ifaces_data
            return radio
        end

        local flow_offload    = false
        local hw_flow_offload = false
        local fw_uci = new_uci()
        fw_uci:foreach("firewall", "defaults", function(s)
            flow_offload    = (s.flow_offloading    == "1" or s.flow_offloading    == true)
            hw_flow_offload = (s.flow_offloading_hw == "1" or s.flow_offloading_hw == true)
            return false
        end)

        local packet_steering = "0"
        local ps_val = uci:get("network", "globals", "packet_steering")
        if ps_val == "1" or ps_val == "2" then packet_steering = ps_val end
        local detected_wan = detect_wan_port(uci, cfg_device)
        local uci_proto = uci_str(uci, "network", iface, "proto") or ""
        local wan_configured = (uci_proto ~= "") or (wan_info.l3_device ~= "") or (wan_info.phys_device ~= "")
        if cfg_device == "" and wan_info.phys_device ~= "" then
            cfg_device = wan_info.phys_device
        end

        local wan_ipv6 = ipv6_is_on(uci_str(uci, "network", iface, "ipv6"))
        local lan_ipv6 = ipv6_is_on(uci_str(uci, "network", "lan", "ipv6"))

        respond({
            iface    = iface,    proto    = proto,
            ipaddr   = ipaddr,   netmask  = netmask,
            gateway  = gateway,  username = username,  password = password,
            mtu      = mtu,      dns      = dns_list,
            peerdns  = peerdns,  device   = cfg_device,
            detected_wan = detected_wan,
            wan_configured = wan_configured,
            flow_offload = flow_offload,
            hw_flow_offload = hw_flow_offload,
            packet_steering = packet_steering,
            wan_ipv6 = wan_ipv6,
            lan_ipv6 = lan_ipv6,
            live_ip  = live_ip,  live_gw  = live_gw,
            live_mtu = live_mtu, live_mac = live_mac, mac = cfg_mac,
            countries = include_wireless and WIFI_COUNTRIES or nil,
            smart_candidates = include_wireless and smart_candidates or nil,
            wpa3_supported = include_wireless and detect_wpa3_support() or nil,
            w2  = include_wireless and load_band("2g",   nil) or nil,
            w5  = include_wireless and load_band("5g",   "_5G") or nil,
            w5b = include_wireless and load_band("5g_2", "_5G_2") or nil,
            w6  = include_wireless and load_band("6g",   "_6G") or nil,
        })
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function wireless_config(include_capabilities, include_ap_features)
    local uci = new_uci()
    local radios = find_radios(uci)
    local smart_candidates = {}
    local ap_map = {}
    local bands = {"2g", "5g", "5g_2", "6g"}

    for _, band in ipairs(bands) do
        local meta = radios[band]
        if meta then
            for _, iface_sec in ipairs(meta.ifaces) do
                local ssid = uci_str(uci, "wireless", iface_sec, "ssid") or ""
                local key = uci_str(uci, "wireless", iface_sec, "key") or ""
                local network = uci_str(uci, "wireless", iface_sec, "network") or "lan"
                local mode = uci_str(uci, "wireless", iface_sec, "mode") or "ap"
                if ssid ~= "" and network == "lan" and mode == "ap" then
                    local map_key = ssid .. "||" .. key
                    if not ap_map[map_key] then ap_map[map_key] = { ssid=ssid, key=key, interfaces={} } end
                    local iface = read_uci_iface(uci, iface_sec, "0")
                    iface.band = band
                    ap_map[map_key].interfaces[#ap_map[map_key].interfaces+1] = iface
                end
            end
        end
    end

    for _, group in pairs(ap_map) do
        if #group.interfaces > 1 then
            local first = group.interfaces[1]
            local mismatch = false
            for i = 2, #group.interfaces do
                local current = group.interfaces[i]
                if current.enc ~= first.enc or current.hidden ~= first.hidden or
                   current.isolate ~= first.isolate or current.bss_transition ~= first.bss_transition or
                   current.ieee80211k ~= first.ieee80211k or current.wnm_sleep_mode ~= first.wnm_sleep_mode then
                    mismatch = true
                    break
                end
            end
            group.mismatch = mismatch
            smart_candidates[#smart_candidates+1] = group
        end
    end

    local base_ssid = "OpenWrt"
    if radios["2g"] and radios["2g"].ifaces[1] then
        base_ssid = uci_str(uci, "wireless", radios["2g"].ifaces[1], "ssid") or base_ssid
    end

    local function load_band(band, suffix)
        local meta = radios[band]
        if not meta then return nil end
        local radio = read_uci_radio(uci, meta.radio_sec)
        if include_capabilities then
            radio.hw_max = detect_hw_max(meta.radio_sec, radio.wifi_gen)
        end
        radio.ifaces = {}
        for i, iface_sec in ipairs(meta.ifaces) do
            local iface = read_uci_iface(uci, iface_sec, radio.disabled)
            if iface.ssid == "" and i == 1 and suffix then iface.ssid = base_ssid .. suffix end
            radio.ifaces[#radio.ifaces+1] = iface
        end
        for _, iface_sec in ipairs(meta.smart_ifaces or {}) do
            local iface = read_uci_iface(uci, iface_sec, radio.disabled)
            iface.is_smart_ap = "1"
            radio.ifaces[#radio.ifaces+1] = iface
        end
        return radio
    end

    return {
        countries = WIFI_COUNTRIES,
        smart_candidates = include_ap_features and smart_candidates or nil,
        wpa3_supported = include_ap_features and detect_wpa3_support() or nil,
        w2 = load_band("2g"),
        w5 = load_band("5g", "_5G"),
        w5b = load_band("5g_2", "_5G_2"),
        w6 = load_band("6g", "_6G"),
    }
end

local function handle_get_ap_config()
    local ok, result = pcall(function() return wireless_config(false, true) end)
    if ok then respond(result) else respond({ error = tostring(result) }) end
end

local function handle_get_radio_config()
    local ok, result = pcall(function() return wireless_config(false, false) end)
    if ok then respond(result) else respond({ error = tostring(result) }) end
end

local function handle_status_wan()
    local ok, err = pcall(function()
        local uci   = new_uci()
        local iface = find_wan_iface()
        local fast  = pbool("fast")
        local conn  = not fast and ubus.connect() or nil

        local proto = uci_str(uci, "network", iface, "proto") or "dhcp"
        if proto == "dhcpv6" then proto = "dhcp" end

        local wan_info = get_wan_info()
        local uci_proto_set = uci:get("network", iface, "proto") ~= nil
        local is_configured = uci_proto_set or wan_info.l3_device ~= "" or wan_info.phys_device ~= ""
        if not is_configured then
            respond({ proto="", iface=iface, ip="-", gateway="-", state="down",
                            rx=0, tx=0, dns="-", mtu="-", mac="-",
                            wan_port="not_configured", internet="offline", uptime="-",
                            peerdns=false, cfg_dns={} })
            return
        end
        if wan_info.proto ~= "" then proto = wan_info.proto end

        local ip, gw, state = "N/A", "N/A", "down"
        local ipv6_ip, ipv6_gw = "-", "-"
        local ubus_available = (conn ~= nil)
        local ubus_up = false
        local ubus_iface = (wan_info.iface and wan_info.iface ~= "") and wan_info.iface or iface
        if conn then
            local ok2, wan = pcall(function()
                return conn:call("network.interface." .. ubus_iface, "status", {})
            end)
            if ok2 and wan then
                if wan.up == true then
                    state = "up"
                    ubus_up = true
                end
                local addrs = wan["ipv4-address"]
                if type(addrs) == "table" and addrs[1] then ip = addrs[1].address or "N/A" end
                local routes = wan.route
                if type(routes) == "table" and routes[1] then gw = routes[1].nexthop or "N/A" end
                if wan.proto and wan.proto ~= "" then
                    local pr = wan.proto:lower()
                    if pr == "dhcpv6" then pr = "dhcp" end
                    proto = pr
                end
                local v6_addrs = wan["ipv6-address"]
                if type(v6_addrs) == "table" and v6_addrs[1] then
                    ipv6_ip = v6_addrs[1].address or "-"
                end
                if type(routes) == "table" then
                    for _, r in ipairs(routes) do
                        local tgt = r.target or ""
                        if tgt == "::" or tgt == "::/0" then
                            if r.nexthop and r.nexthop ~= "" then
                                ipv6_gw = r.nexthop
                                break
                            end
                        end
                    end
                end
            end

            -- Query wan6 (dhcpv6) for IPv6 address/gateway when present
            if uci:get("network", "wan6") then
                local ok3, wan6 = pcall(function()
                    return conn:call("network.interface.wan6", "status", {})
                end)
                if ok3 and wan6 and wan6.up then
                    local v6a = wan6["ipv6-address"]
                    if type(v6a) == "table" and v6a[1] and v6a[1].address ~= "" then
                        ipv6_ip = v6a[1].address
                    end
                    local v6r = wan6.route
                    if type(v6r) == "table" then
                        for _, r in ipairs(v6r) do
                            local tgt = r.target or ""
                            if tgt == "::" or tgt == "::/0" then
                                if r.nexthop and r.nexthop ~= "" then
                                    ipv6_gw = r.nexthop; break
                                end
                            end
                        end
                    end
                end
            end
        end

        local cfg_device = uci_str(uci, "network", iface, "device") or ""
        local devs = {}
        local seen = {}
        local function add_dev(d)
            if d and d ~= "" and not seen[d] then seen[d] = true; devs[#devs+1] = d end
        end
        add_dev("ppp0")
        add_dev("pppoe-"..iface)
        add_dev("ppp1")
        add_dev(wan_info.l3_device)
        add_dev(wan_info.phys_device)
        add_dev(cfg_device)
        add_dev(iface)
        add_dev("eth1")
        add_dev("eth0.2")
        add_dev("eth0")
        if ip == "N/A" and (not ubus_available or not ubus_up) then
            local v = read_sysfs("/tmp/network/interface/" .. iface .. "/ipaddr")
                   or read_sysfs("/tmp/network/interface/" .. iface .. "/address")
            if v and v ~= "" then ip = v end
        end
        if gw == "N/A" then local r = read_default_gw(); if r then gw = r end end
        if state == "down" and ip ~= "N/A" and ip ~= "" and ip ~= "-" then
            if not ip:match("^127%.") and not ip:match("^169%.254%.") then
                state = "up"
            end
        end
        if proto == "static" and not ubus_available then
            if ip == "N/A" then ip = uci_str(uci, "network", iface, "ipaddr")  or "N/A" end
            if gw == "N/A" then gw = uci_str(uci, "network", iface, "gateway") or "N/A" end
        end

        local rx, tx = 0, 0
        if conn then
            local dev_name = wan_info.phys_device ~= "" and wan_info.phys_device or wan_info.l3_device or iface
            local ok2, ds = pcall(function()
                return conn:call("network.device", "status", { name = dev_name })
            end)
            if ok2 and ds and ds.statistics then
                rx = ds.statistics.rx_bytes or 0
                tx = ds.statistics.tx_bytes or 0
            end
        end
        if rx == 0 then
            for _, dev in ipairs(devs) do
                local r = tonumber(read_sysfs("/sys/class/net/" .. dev .. "/statistics/rx_bytes"))
                if r then rx = r; tx = tonumber(read_sysfs("/sys/class/net/" .. dev .. "/statistics/tx_bytes")) or 0; break end
            end
        end

        local dns_servers, dns_seen = {}, {}
        local ipv6_dns_servers, ipv6_dns_seen = {}, {}
        for _, path in ipairs({"/tmp/resolv.conf.d/resolv.conf.auto","/tmp/resolv.conf.auto","/tmp/resolv.conf","/etc/resolv.conf"}) do
            local f = io.open(path, "r")
            if f then
                for line in f:lines() do
                    local s = line:match("^nameserver%s+(%S+)")
                    if s and s ~= "127.0.0.1" and s ~= "::1" and not dns_seen[s] and not ipv6_dns_seen[s] then
                        if s:find(":") then
                            ipv6_dns_seen[s] = true
                            if #ipv6_dns_servers < 2 then ipv6_dns_servers[#ipv6_dns_servers+1] = s end
                        else
                            dns_seen[s] = true
                            if #dns_servers < 2 then dns_servers[#dns_servers+1] = s end
                        end
                    end
                    if #dns_servers >= 2 and #ipv6_dns_servers >= 2 then break end
                end
                f:close()
                if #dns_servers > 0 and #ipv6_dns_servers > 0 then break end
            end
        end
        if #dns_servers == 0 then
            for d in (uci_str(uci, "network", iface, "dns") or ""):gmatch("%S+") do
                if not dns_seen[d] then dns_seen[d]=true; dns_servers[#dns_servers+1]=d end
                if #dns_servers >= 2 then break end
            end
        end

        local live_mtu, live_mac = "-", "-"
        for _, dev in ipairs(devs) do
            local m = read_sysfs("/sys/class/net/" .. dev .. "/mtu")
            if m and m ~= "" then live_mtu = m; break end
        end
        for _, dev in ipairs(devs) do
            local m = read_sysfs("/sys/class/net/" .. dev .. "/address")
            if m and m ~= "" and m ~= "00:00:00:00:00:00" then live_mac = m:upper(); break end
        end

        if conn then pcall(function() conn:close() end) end
        local wan_port = wan_port_state(iface)
        local ping_iface = wan_info.l3_device ~= "" and wan_info.l3_device or wan_info.phys_device or nil
        local internet = ping_online(ping_iface) and "online" or "offline"
        local wan_uptime = get_wan_uptime(iface)
        local cfg_dns_raw = uci_str(uci, "network", iface, "dns") or ""
        local cfg_dns_list = {}
        for d in cfg_dns_raw:gmatch("%S+") do cfg_dns_list[#cfg_dns_list+1] = d end
        local peerdns_disp = (uci_str(uci, "network", iface, "peerdns") ~= "0")
        local ipv6_enabled = ipv6_is_on(uci_str(uci, "network", iface, "ipv6")) or (uci:get("network", "wan6") ~= nil)

        local conn_error = nil
        if internet ~= "online" and wan_port ~= "not_configured" then
            if proto == "pppoe" then
                local ppp0_state = read_sysfs("/sys/class/net/ppp0/operstate")
                local auth_failed = false
                for _, logpath in ipairs({
                    "/tmp/ppp/connect-errors",
                    "/var/log/ppp/connect-errors",
                    "/tmp/pppoe.log",
                }) do
                    local lf = io.open(logpath, "r")
                    if lf then
                        local content = lf:read("*a"); lf:close()
                        local cl = content:lower()
                        if cl:find("authentication failed") or
                           cl:find("access denied") or
                           cl:find("login incorrect") or
                           cl:find("pap authentication failed") or
                           cl:find("chap authentication failed") or
                           cl:find("lcp: timeout") then
                            auth_failed = true; break
                        end
                    end
                end
                if not auth_failed then
                    local kl = nil
                    local kf = io.open("/var/log/messages", "r")
                    if kf then
                        kl = kf:read("*a"); kf:close()
                    else
                        kl = exec("logread 2>/dev/null")
                    end
                    local klc = kl and kl:lower()
                    if klc and (klc:find("pap auth fail") or klc:find("chap auth fail") or
                                klc:find("authentication failed") or klc:find("access denied")) then
                        auth_failed = true
                    end
                end
                if auth_failed then
                    conn_error = "pppoe_auth"
                elseif not ppp0_state or ppp0_state == "down" or ppp0_state == "" then
                    conn_error = "pppoe_link"
                else
                    conn_error = "no_internet"
                end
            elseif proto == "dhcp" then
                local has_ip = (ip ~= "N/A" and ip ~= "" and ip ~= "-" and
                                not ip:match("^169%.254%."))
                if not has_ip then
                    conn_error = "dhcp_timeout"
                else
                    conn_error = "no_internet"
                end
            elseif proto == "static" then
                local has_ip = (ip ~= "N/A" and ip ~= "" and ip ~= "-")
                if has_ip then
                    conn_error = "static_no_route"
                else
                    conn_error = "no_internet"
                end
            else
                conn_error = "no_internet"
            end
        end

        respond({ proto=proto, iface=iface, ip=ip, gateway=gw, state=state,
                        rx=rx, tx=tx, dns=table.concat(dns_servers,",  "), mtu=live_mtu, mac=live_mac,
                        wan_port=wan_port, internet=internet, uptime=wan_uptime,
                        peerdns=peerdns_disp, cfg_dns=cfg_dns_list,
                        ipv6_enabled=ipv6_enabled,
                        ipv6_ip=ipv6_ip, ipv6_gw=ipv6_gw,
                        ipv6_dns=table.concat(ipv6_dns_servers, ",  "),
                        conn_error=conn_error })
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_reconnect_wan()
    local iface = find_wan_iface()
    exec("ifdown " .. iface .. " && ifup " .. iface .. " 2>/dev/null &")
    respond({ success = true, message = "WAN reconnecting..." })
end

local function handle_save_wan()
    local ok, err = pcall(function()
        local uci   = new_uci()
        local iface = find_wan_iface()

        local new_proto    = p("proto")    or "dhcp"
        local new_mtu      = (p("mtu") or ""):match("^%s*(%d*)%s*$") or ""
        local new_mac      = p("mac")      or ""
        local new_device   = p("device")   or ""
        local new_peerdns  = pbool("peerdns")
        local new_username = p("username") or ""
        local new_password = p("password") or ""
        local new_ipaddr   = p("ipaddr")   or ""
        local new_netmask  = p("netmask")  or ""
        local new_gateway  = p("gateway")  or ""
        local new_ps       = p("packet_steering") or "0"
        if new_ps ~= "0" and new_ps ~= "1" and new_ps ~= "2" then new_ps = "0" end

        local dns_entries = {}
        local dns_raw = p("dns") or ""
        for v in dns_raw:gmatch("[^,]+") do
            v = v:match("^%s*(.-)%s*$")
            if v ~= "" then dns_entries[#dns_entries+1] = v end
        end

        local cur_proto   = uci_str(uci, "network", iface, "proto")    or "dhcp"
        local cur_mtu     = uci_str(uci, "network", iface, "mtu")      or ""
        local cur_mac     = uci_str(uci, "network", iface, "macaddr")  or ""
        local cur_device  = uci_str(uci, "network", iface, "device")   or ""
        local cur_peer    = uci_str(uci, "network", iface, "peerdns")
        local cur_peerdns = (cur_peer ~= "0")
        local cur_user    = uci_str(uci, "network", iface, "username") or ""
        local cur_pass    = uci_str(uci, "network", iface, "password") or ""
        local cur_ip      = uci_str(uci, "network", iface, "ipaddr")   or ""
        local cur_mask    = uci_str(uci, "network", iface, "netmask")  or ""
        local cur_gw      = uci_str(uci, "network", iface, "gateway")  or ""
        local cur_ps      = uci_str(uci, "network", "globals", "packet_steering") or "0"

        local cur_dns_str = uci_str(uci, "network", iface, "dns") or ""
        local cur_dns = {}
        for v in cur_dns_str:gmatch("%S+") do cur_dns[#cur_dns+1] = v end
        local new_dns_str = table.concat(dns_entries, " ")
        local cur_dns_cmp = table.concat(cur_dns, " ")

        local eff_pass = (new_password ~= "") and new_password or cur_pass

        local new_wan_ipv6, new_lan_ipv6
        local wan_ipv6_changed, lan_ipv6_changed = false, false
        if p_has("wan_ipv6") then
            new_wan_ipv6 = pbool("wan_ipv6")
            wan_ipv6_changed = (new_wan_ipv6 ~= ipv6_is_on(uci_str(uci, "network", iface, "ipv6")))
        end
        if p_has("lan_ipv6") and uci:get("network", "lan") then
            new_lan_ipv6 = pbool("lan_ipv6")
            lan_ipv6_changed = (new_lan_ipv6 ~= ipv6_is_on(uci_str(uci, "network", "lan", "ipv6")))
        end

        local iface_changed =
            new_proto   ~= cur_proto   or
            new_mtu     ~= cur_mtu     or
            new_mac     ~= cur_mac     or
            (new_device ~= "" and new_device ~= cur_device) or
            (new_proto == "static" and (new_ipaddr ~= cur_ip or new_netmask ~= cur_mask or new_gateway ~= cur_gw)) or
            (new_proto == "pppoe"  and (new_username ~= cur_user or eff_pass ~= cur_pass)) or
            wan_ipv6_changed

        local dns_changed     = (new_dns_str ~= cur_dns_cmp) or (new_peerdns ~= cur_peerdns)
        local ps_changed      = (new_ps ~= cur_ps)

        create_wan_interface(uci, iface)

        uci:set("network", iface, "proto",   new_proto)

        if new_mtu ~= "" then
            uci:set("network", iface, "mtu", new_mtu)
        else
            uci:delete("network", iface, "mtu")
        end
        uci:set("network", iface, "peerdns", new_peerdns and "1" or "0")

        if new_mac ~= "" then
            uci:set("network", iface, "macaddr", new_mac)
        else
            uci:delete("network", iface, "macaddr")
        end
        if new_device ~= "" then
            uci:set("network", iface, "device", new_device)
        end

        uci:delete("network", iface, "ipaddr");  uci:delete("network", iface, "netmask")
        uci:delete("network", iface, "gateway"); uci:delete("network", iface, "dns")
        uci:delete("network", iface, "username")
        if new_password ~= "" then
            uci:set("network", iface, "password", new_password)
        elseif new_proto ~= "pppoe" then
            uci:delete("network", iface, "password")
        end

        if new_proto == "static" then
            uci:set("network", iface, "ipaddr",  new_ipaddr)
            uci:set("network", iface, "netmask", new_netmask)
            uci:set("network", iface, "gateway", new_gateway)
            if #dns_entries > 0 then uci:set("network", iface, "dns", new_dns_str)
            else uci:delete("network", iface, "dns") end
        elseif new_proto == "pppoe" then
            uci:set("network", iface, "username", new_username)
            if not new_peerdns then
                if #dns_entries > 0 then uci:set("network", iface, "dns", new_dns_str)
                else uci:delete("network", iface, "dns") end
            end
        elseif new_proto == "dhcp" then
            if not new_peerdns then
                if #dns_entries > 0 then uci:set("network", iface, "dns", new_dns_str)
                else uci:delete("network", iface, "dns") end
            end
        end

        if p_has("wan_ipv6") then
            if new_wan_ipv6 then
                uci:delete("network", iface, "ipv6")
            else
                uci:set("network", iface, "ipv6", "0")
            end
        end

        if p_has("lan_ipv6") and uci:get("network", "lan") then
            if new_lan_ipv6 then
                uci:set("network", "lan", "ipv6", "1")
                uci:set("network", "lan", "delegate", "1")
                if not uci_str(uci, "network", "lan", "ip6assign") then
                    uci:set("network", "lan", "ip6assign", "60")
                end
            else
                uci:set("network", "lan", "ipv6", "0")
                uci:set("network", "lan", "delegate", "0")
                uci:delete("network", "lan", "ip6assign")
            end
        end

        -- wan6 dhcpv6 interface: create/remove alongside the WAN IPv6 toggle
        local wan6_action = "noop"
        if p_has("wan_ipv6") then
            if new_wan_ipv6 then
                local w6dev = new_device ~= "" and new_device or cur_device
                wan6_action = ensure_wan6(uci, iface, w6dev, new_proto)
            else
                wan6_action = remove_wan6(uci) and "removed" or "noop"
            end
        end
        local wan6_changed = (wan6_action == "created" or wan6_action == "updated" or wan6_action == "removed")

        local saved = uci:commit("network")
        local restarted = false
        local lan_restarted = false

        if saved then
            if ps_changed then
                if not uci:get("network", "globals") then
                    uci:set("network", "globals", "globals")
                end
                uci:set("network", "globals", "packet_steering", new_ps)
                uci:commit("network")
            end

            local fw_changed = setup_firewall_for_wan(iface)
            if wan6_action == "created" then
                if setup_firewall_for_wan("wan6") then
                    fw_changed = true
                end
            elseif wan6_action == "removed" then
                if remove_wan6_from_firewall() then
                    fw_changed = true
                end
            end
            if fw_changed then
                exec("/etc/init.d/firewall reload 2>/dev/null &")
            end

            if iface_changed then
                exec("ifdown " .. iface .. " && ifup " .. iface .. " 2>/dev/null &")
                restarted = true
            elseif dns_changed then
                local resolv = io.open("/tmp/resolv.conf.d/resolv.conf.auto", "w")
                if resolv then
                    for _, v in ipairs(dns_entries) do
                        resolv:write("nameserver " .. v .. "\n")
                    end
                    resolv:close()
                end
                exec("/etc/init.d/dnsmasq reload 2>/dev/null || /etc/init.d/dnsmasq restart 2>/dev/null")
            end

            -- wan6 dhcpv6 interface lifecycle
            if wan6_action == "created" or wan6_action == "updated" then
                exec("ifdown wan6 2>/dev/null; ifup wan6 2>/dev/null &")
                restarted = true
            elseif wan6_action == "removed" then
                exec("ifdown wan6 2>/dev/null &")
            end

            if lan_ipv6_changed then
                exec("ifdown lan && ifup lan 2>/dev/null &")
                restarted = true
                lan_restarted = true
            end
        end

        respond({ success = saved, restarted = restarted, lan_restarted = lan_restarted,
                        message = saved and "WAN settings saved." or "Failed to save." })
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_save_wireless()
    local ok, err = pcall(function()
        local uci       = new_uci()
        local save_type = p("save_type") or "iface"
        local band      = p("band")      or "2g"
        local base_band = band:match("^(5g)") and "5g" or band:match("^(6g)") and "6g" or "2g"
        local is_5g     = (base_band == "5g" or base_band == "6g")

        if save_type == "radio" then
            local radio_sec = p("radio_sec") or "radio0"
            local htmode    = p("htmode")  or (base_band == "6g" and "HE80" or is_5g and "VHT80" or "HT20")
            local channel   = p("channel") or "auto"
            local txpower   = p("txpower") or ""
            local country   = (p("country") or ""):upper()
            local noscan    = (band == "2g" and p("noscan") == "1") and "1" or "0"
            local dev_dis   = p("dev_disabled") or "0"

            uci:set("wireless", radio_sec, "htmode", htmode)
            local hwmode_val = safe_hwmode(base_band)
            if hwmode_val then
                uci:set("wireless", radio_sec, "hwmode", hwmode_val)
            else
                uci:delete("wireless", radio_sec, "hwmode")
            end
            uci:set("wireless", radio_sec, "channel", channel)
            local txpower_n = tonumber(txpower)
            if txpower_n and txpower_n >= 1 and txpower_n <= 40 then
                uci:set("wireless", radio_sec, "txpower", tostring(math.floor(txpower_n)))
            else
                uci:delete("wireless", radio_sec, "txpower")
            end
            if country ~= "" then
                uci:set("wireless", radio_sec, "country", country)
            else
                uci:delete("wireless", radio_sec, "country")
            end
            if noscan == "1" then
                uci:set("wireless", radio_sec, "noscan", "1")
            else
                uci:delete("wireless", radio_sec, "noscan")
            end
            if dev_dis == "1" then
                uci:set("wireless", radio_sec, "disabled", "1")
            else
                uci:delete("wireless", radio_sec, "disabled")
            end

        elseif save_type == "new_iface" then
            local radio_sec = p("radio_sec") or "radio0"
            local ssid      = p("ssid")    or "OpenWrt"
            local enc       = p("enc")     or "psk2"
            local key       = p("key")     or ""
            local hidden    = p("hidden")  or "0"
            local iface_dis = p("iface_disabled") or "0"
            local roam      = (p("roam") == "1") and "1" or "0"
            local isolate   = (p("isolate") == "1") and "1" or "0"
            local wnm       = (p("wnm") == "1") and "1" or "0"

            local base = ssid:lower():gsub("[^%w]", "_"):sub(1, 20)
            local new_sec = base
            local idx = 2
            while uci:get("wireless", new_sec) do
                new_sec = base .. "_" .. idx
                idx = idx + 1
            end

            uci:set("wireless", new_sec, "wifi-iface")
            uci:set("wireless", new_sec, "device",  radio_sec)
            uci:set("wireless", new_sec, "mode",    "ap")
            uci:set("wireless", new_sec, "network", "lan")
            uci:set("wireless", new_sec, "ssid",    ssid)
            uci:set("wireless", new_sec, "encryption", enc)
            if enc ~= "none" and key ~= "" then
                uci:set("wireless", new_sec, "key", key)
            end
            if hidden == "1" then uci:set("wireless", new_sec, "hidden", "1") end
            if iface_dis == "1" then uci:set("wireless", new_sec, "disabled", "1") end
            uci:set("wireless", new_sec, "ieee80211k",     roam)
            uci:set("wireless", new_sec, "bss_transition", roam)
            uci:set("wireless", new_sec, "isolate",        isolate)
            uci:set("wireless", new_sec, "wnm_sleep_mode", wnm)

            local saved = uci:commit("wireless")
            if saved then exec("wifi reload 2>/dev/null &") end
            respond({ success = saved, iface_sec = new_sec,
                            message = saved and "SSID added." or "Failed to add SSID." })
            return

        else
            local iface_sec = p("iface_sec") or "default_radio0"
            local ssid      = p("ssid")    or "OpenWrt"
            local enc       = p("enc")     or "none"
            local key       = p("key")     or ""
            local hidden    = p("hidden")  or "0"
            local iface_dis = p("iface_disabled") or "0"
            local roam      = (p("roam") == "1") and "1" or "0"
            local isolate   = (p("isolate") == "1") and "1" or "0"
            local wnm       = (p("wnm") == "1") and "1" or "0"

            local cur_ssid = uci_str(uci, "wireless", iface_sec, "ssid")       or ""
            local cur_enc  = uci_str(uci, "wireless", iface_sec, "encryption") or "none"
            local cur_key  = uci_str(uci, "wireless", iface_sec, "key")        or ""
            local cur_hid  = uci_str(uci, "wireless", iface_sec, "hidden")     or "0"
            local cur_dis  = uci_str(uci, "wireless", iface_sec, "disabled")   or "0"
            local cur_roam    = uci_str(uci, "wireless", iface_sec, "bss_transition") or "0"
            local cur_isolate = uci_str(uci, "wireless", iface_sec, "isolate")        or "0"
            local cur_wnm     = uci_str(uci, "wireless", iface_sec, "wnm_sleep_mode") or "0"

            if enc == "none" then key = "" end
            if cur_enc == "none" then cur_key = "" end

            local changed = (cur_ssid ~= ssid or cur_enc ~= enc or cur_key ~= key
                             or cur_hid ~= hidden or cur_dis ~= iface_dis
                             or cur_roam ~= roam or cur_isolate ~= isolate
                             or cur_wnm ~= wnm)

            if not changed then
                respond({ success = true, message = "No changes." })
                return
            end

            uci:set("wireless", iface_sec, "ssid",       ssid)
            uci:set("wireless", iface_sec, "encryption", enc)
            if enc ~= "none" and key ~= "" then
                uci:set("wireless", iface_sec, "key", key)
            elseif enc == "none" then
                uci:delete("wireless", iface_sec, "key")
            end
            if hidden == "1" then
                uci:set("wireless", iface_sec, "hidden", "1")
            else
                uci:delete("wireless", iface_sec, "hidden")
            end
            if iface_dis == "1" then
                uci:set("wireless", iface_sec, "disabled", "1")
            else
                uci:delete("wireless", iface_sec, "disabled")
            end
            uci:set("wireless", iface_sec, "ieee80211k",     roam)
            uci:set("wireless", iface_sec, "bss_transition", roam)
            uci:set("wireless", iface_sec, "isolate", isolate)
            uci:set("wireless", iface_sec, "wnm_sleep_mode", wnm)
        end

        local saved = uci:commit("wireless")
        if saved then exec("wifi reload 2>/dev/null &") end
        respond({ success = saved, message = saved and "Wireless settings saved." or "Failed to save." })
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_status_wireless()
    local ok, err = pcall(function()
        local uci2   = new_uci()
        local radios = find_radios(uci2)

        local iface_band = {}
        for band_key, r in pairs(radios) do
            for _, iface_sec in ipairs(r.ifaces) do
                iface_band[iface_sec] = band_key
            end
        end

        local conn   = ubus.connect()
        local result = {}
        for band_key, _ in pairs(radios) do
            result["clients_"  .. band_key] = 0
            result["signal_"   .. band_key] = "N/A"
            result["ssid_"     .. band_key] = ""
            result["channel_"  .. band_key] = "N/A"
            result["wifi_gen_" .. band_key] = ""
            result["hw_max_"   .. band_key] = ""
        end

        if conn then
            local ok_objs, hostapd_objs = pcall(function() return conn:objects() end)
            if ok_objs and hostapd_objs then
                for _, line in ipairs(hostapd_objs) do
                    local iface = line:match("^hostapd%.(.+)$")
                    if iface then
                        local band_key = iface_band[iface]
                        local ok3, status = pcall(function()
                            return conn:call("hostapd." .. iface, "get_status", {})
                        end)
                        if not band_key then
                            local fmhz = (ok3 and status) and (tonumber(status.freq) or 0) or 0
                            if     fmhz >= 2400 and fmhz < 2500 then band_key = "2g"
                            elseif fmhz >= 5925 and fmhz < 7125 then band_key = "6g"
                            elseif fmhz >= 5000 and fmhz < 6000 then band_key = "5g"
                            end
                        end
                        if band_key then
                            local ok2, cli = pcall(function()
                                return conn:call("hostapd." .. iface, "get_clients", {})
                            end)
                            local count = 0
                            if ok2 and cli and cli.clients then
                                for _ in pairs(cli.clients) do count = count + 1 end
                            end
                            local ssid      = (ok3 and status and status.ssid)   or ""
                            local ch        = (ok3 and status) and tostring(status.channel or "N/A") or "N/A"
                            local op_htmode = (ok3 and status and status.htmode) or ""
                            local op_gen    = gen_from_htmode(op_htmode) or ""
                            local ok4, iw = pcall(function()
                                return conn:call("iwinfo", "info", { device = iface })
                            end)
                            local sig    = (ok4 and iw and iw.signal) and (iw.signal .. " dBm") or "N/A"
                            local hw_max = ""
                            if ok4 and iw then
                                local htm = type(iw.htmodes) == "table" and iw.htmodes or {}
                                for _, h in ipairs(htm) do
                                    h = tostring(h):upper()
                                    if     h:find("^EHT") then hw_max = "11be"; break
                                    elseif h:find("^HE")  then hw_max = "11ax"
                                    elseif h:find("^VHT") then if hw_max == "" then hw_max = "11ac" end
                                    elseif h:find("^HT")  then if hw_max == "" then hw_max = "11n"  end
                                    end
                                end
                            end
                            if not result["clients_" .. band_key] then
                                result["clients_"  .. band_key] = 0
                                result["signal_"   .. band_key] = "N/A"
                                result["ssid_"     .. band_key] = ""
                                result["channel_"  .. band_key] = "N/A"
                                result["wifi_gen_" .. band_key] = ""
                                result["hw_max_"   .. band_key] = ""
                            end
                            result["clients_"  .. band_key] = result["clients_" .. band_key] + count
                            result["signal_"   .. band_key] = sig
                            result["ssid_"     .. band_key] = ssid
                            result["channel_"  .. band_key] = ch
                            result["wifi_gen_" .. band_key] = op_gen
                            result["hw_max_"   .. band_key] = hw_max
                        end
                    end
                end
            end
            pcall(function() conn:close() end)
        end
        respond(result)
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_delete_iface()
    local ok, err = pcall(function()
        local uci       = new_uci()
        local iface_sec = p("iface_sec") or ""

        if iface_sec == "" then
            respond({ success = false, message = "No iface_sec provided." })
            return
        end

        local sec_type = uci:get("wireless", iface_sec)
        if sec_type ~= "wifi-iface" then
            respond({ success = false, message = "Invalid section: not a wifi-iface." })
            return
        end

        uci:delete("wireless", iface_sec)
        local saved = uci:commit("wireless")
        if saved then exec("wifi reload 2>/dev/null &") end
        respond({ success = saved, message = saved and "SSID deleted." or "Failed to delete." })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function radio_capabilities(conn, wireless_status, radio, is_5g, wifi_gen)
        local channels = {}
        local htmodes  = {}
        local txpower_list = {}
        local active_channel = nil
        local hw_max = wifi_gen or "11n"

        if conn then
            local iface_name = radio
            if wireless_status and type(wireless_status[radio]) == "table" then
                local ifaces = wireless_status[radio].interfaces
                if type(ifaces) == "table" and ifaces[1] and ifaces[1].ifname then
                    iface_name = ifaces[1].ifname
                end
            end

            local ok2, freqs = pcall(function()
                return conn:call("iwinfo", "freqlist", { device = iface_name })
            end)
            if not (ok2 and freqs and type(freqs.results) == "table"
                    and #freqs.results > 0) and iface_name ~= radio then
                ok2, freqs = pcall(function()
                    return conn:call("iwinfo", "freqlist", { device = radio })
                end)
            end
            if ok2 and freqs and type(freqs.results) == "table" then
                for _, ent in ipairs(freqs.results) do
                    local ch = ent.channel
                    local restricted = (ent.restricted == true or ent.restricted == 1)
                    if ch and type(ch) == "number" and ch > 0 and not restricted then
                        channels[#channels+1] = {
                            channel = ch,
                            mhz     = ent.mhz or 0,
                            dfs     = (ent.dfs == true or ent.dfs == 1
                                       or ent.radar == true or ent.radar == 1),
                        }
                    end
                end
            end

            local ok3, info = pcall(function()
                return conn:call("iwinfo", "info", { device = iface_name })
            end)
            if not (ok3 and info) and iface_name ~= radio then
                ok3, info = pcall(function()
                    return conn:call("iwinfo", "info", { device = radio })
                end)
            end
            if ok3 and info then
                hw_max = hw_max_from_info(info, wifi_gen)
                if type(info.htmodes) == "table" then
                    for _, h in ipairs(info.htmodes) do
                        htmodes[#htmodes+1] = tostring(h)
                    end
                end
                local live_ch = tonumber(info.channel)
                if live_ch and live_ch > 0 then
                    active_channel = live_ch
                end
            end

            local ok4, pwrlist = pcall(function()
                return conn:call("iwinfo", "txpowerlist", { device = iface_name })
            end)
            if not (ok4 and pwrlist) and iface_name ~= radio then
                ok4, pwrlist = pcall(function()
                    return conn:call("iwinfo", "txpowerlist", { device = radio })
                end)
            end
            if ok4 and pwrlist and type(pwrlist.results) == "table" then
                local seen = {}
                for _, e in ipairs(pwrlist.results) do
                    local dbm = tonumber(e.dbm)
                    if dbm and dbm >= 0 and not seen[dbm] then
                        seen[dbm] = true
                        txpower_list[#txpower_list+1] = dbm
                    end
                end
                table.sort(txpower_list, function(a,b) return a > b end)
            end
        end

        if #channels == 0 then
            if is_5g then
                for _, ch in ipairs({36,40,44,48,52,56,60,64,
                                     100,104,108,112,116,120,124,128,
                                     132,136,140,144,149,153,157,161,165}) do
                    channels[#channels+1] = { channel=ch, mhz=5000+ch*5, dfs=(ch>=52 and ch<=144) }
                end
            else
                for ch = 1, 13 do
                    channels[#channels+1] = { channel=ch, mhz=2407+ch*5, dfs=false }
                end
            end
        end
        if #htmodes == 0 then
            htmodes = is_5g and {"HT20","HT40","VHT20","VHT40","VHT80"} or {"HT20","HT40"}
        end
        if #txpower_list == 0 then
            if is_5g then txpower_list = {30,27,25,23,20,17,14,10}
            else          txpower_list = {20,17,15,14,12,10,7} end
        end

        return {
            channels       = channels,
            htmodes        = htmodes,
            txpower_list   = txpower_list,
            active_channel = active_channel,
            hw_max          = hw_max,
        }
end

local function handle_get_channels()
    local ok, err = pcall(function()
        local radio = p("radio") or "radio0"
        local uci = new_uci()
        local radios = find_radios(uci)
        local is_5g = false
        local wifi_gen = "11n"
        for band_key, meta in pairs(radios) do
            if meta.radio_sec == radio then
                is_5g = (band_key == "5g" or band_key == "6g"
                         or band_key:match("^5g_") ~= nil
                         or band_key:match("^6g_") ~= nil)
                wifi_gen = read_uci_radio(uci, radio).wifi_gen
                break
            end
        end

        local conn
        local wireless_status
        local ok_ub, connected = pcall(ubus.connect)
        if ok_ub then conn = connected end
        if conn then
            local ok_ws, status = pcall(function()
                return conn:call("network.wireless", "status", {})
            end)
            if ok_ws then wireless_status = status end
        end
        local result = radio_capabilities(conn, wireless_status, radio, is_5g, wifi_gen)
        if conn then pcall(function() conn:close() end) end
        respond(result)
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_get_radio_capabilities()
    local ok, err = pcall(function()
        local uci = new_uci()
        local radios = find_radios(uci)
        local result = { radios = {} }
        local conn
        local wireless_status
        local ok_ub, connected = pcall(ubus.connect)
        if ok_ub then conn = connected end
        if conn then
            local ok_ws, status = pcall(function()
                return conn:call("network.wireless", "status", {})
            end)
            if ok_ws then wireless_status = status end
        end

        for band_key, meta in pairs(radios) do
            local is_5g = (band_key == "5g" or band_key == "6g"
                           or band_key:match("^5g_") ~= nil
                           or band_key:match("^6g_") ~= nil)
            local radio = read_uci_radio(uci, meta.radio_sec)
            result.radios[meta.radio_sec] = radio_capabilities(
                conn, wireless_status, meta.radio_sec, is_5g, radio.wifi_gen)
        end

        if conn then pcall(function() conn:close() end) end
        respond(result)
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_get_wan_devices()
    local ok, err = pcall(function()
        local devices = get_wan_devices()
        respond({ success = true, devices = devices })
    end)
    if not ok then respond({ success = false, error = tostring(err) }) end
end

local function handle_save_offload()
    local ok, err = pcall(function()
        local uci2 = new_uci()
        -- The UI (onOffloadChange) enforces that hardware and software offload
        -- are mutually exclusive: enabling one auto-disables the other and only
        -- the resulting state is submitted. Honor that exactly as received so a
        -- page refresh restores the same state the user saw.
        local sw   = pbool("flow_offload")
        local hw   = pbool("hw_flow_offload")

        local defaults_sec = nil
        uci2:foreach("firewall", "defaults", function(s)
            defaults_sec = s[".name"]; return false
        end)
        if not defaults_sec then
            defaults_sec = uci2:add("firewall", "defaults")
        end

        local cur_sw = (uci2:get("firewall", defaults_sec, "flow_offloading")    == "1")
        local cur_hw = (uci2:get("firewall", defaults_sec, "flow_offloading_hw") == "1")
        if cur_sw == sw and cur_hw == hw then
            respond({ success = true, message = "No changes." })
            return
        end

        uci2:set("firewall", defaults_sec, "flow_offloading",    sw and "1" or "0")
        uci2:set("firewall", defaults_sec, "flow_offloading_hw", hw and "1" or "0")
        local saved = uci2:commit("firewall")
        if saved then
            exec("/etc/init.d/firewall reload 2>/dev/null &")
        end
        respond({ success = saved, message = saved and "Offload settings applied." or "Failed to save." })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_save_pkt_steering()
    local ok, err = pcall(function()
        local uci2 = new_uci()
        local val  = p("packet_steering") or "0"
        if val ~= "0" and val ~= "1" and val ~= "2" then val = "0" end

        local cur = uci2:get("network", "globals", "packet_steering") or "0"
        if cur == val then
            local labels = { ["0"]="Disabled", ["1"]="Enabled", ["2"]="Enabled (all CPUs)" }
            respond({ success = true, message = "Packet Steering already set to " .. (labels[val] or val) .. "." })
            return
        end

        if not uci2:get("network", "globals") then
            uci2:set("network", "globals", "globals")
        end
        uci2:set("network", "globals", "packet_steering", val)
        local saved = uci2:commit("network")
        local labels = { ["0"]="Disabled", ["1"]="Enabled", ["2"]="Enabled (all CPUs)" }
        respond({
            success = saved,
            message = saved and "Packet Steering set to " .. (labels[val] or val) .. "."
                             or "Failed to save."
        })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_get_guest_config()
    local ok, err = pcall(function()
        local uci    = new_uci()
        local result = {
            ipaddr            = "192.168.2.1",
            guest_zone_exists = false,
            firewall_ok       = false,
            dhcp_ok           = false,
            interface_up      = false,
            existing_subnets  = {},
            bands             = {},
            wpa3_supported    = detect_wpa3_support(),
        }

        local raw_ip = uci:get("network", "guest_zone", "ipaddr")
        if raw_ip then
            result.ipaddr            = raw_ip:match("^(%d+%.%d+%.%d+%.%d+)") or raw_ip
            result.guest_zone_exists = true
        else
            result.guest_zone_exists = false
            result.ipaddr            = find_free_guest_subnet(uci)
        end

        local ok_ub, conn = pcall(ubus.connect)
        if ok_ub and conn then
            local ok2, st = pcall(function() return conn:call("network.interface.guest_zone", "status", {}) end)
            if ok2 and st and st.up then result.interface_up = true end
            pcall(function() conn:close() end)
        end

        if not result.interface_up then
            local br_state = read_sysfs("/sys/class/net/br-guest_zone/operstate")
            if br_state == "up" or br_state == "unknown" then
                local br_addr = read_sysfs("/sys/class/net/br-guest_zone/address")
                if br_addr and br_addr ~= "" and br_addr ~= "00:00:00:00:00:00" then
                    result.interface_up = true
                end
            end
        end

        if not result.interface_up then
            local iface_state = read_sysfs("/sys/class/net/guest_zone/operstate")
            if iface_state == "up" or iface_state == "unknown" then
                result.interface_up = true
            end
        end

        uci:foreach("network", "interface", function(s)
            local ip = s.ipaddr
            if type(ip) == "string" then
                local bare = ip:match("^(%d+%.%d+%.%d+%.%d+)") or ip
                local prefix = bare:match("^(%d+%.%d+%.%d+%.)")
                if prefix and s[".name"] ~= "guest_zone" then
                    result.existing_subnets[prefix] = s[".name"]
                end
            end
        end)

        local fw_uci = new_uci()
        pcall(function()
            fw_uci:foreach("firewall", "zone", function(s)
                if s.name == "guest_zone" then result.firewall_ok = true; return false end
            end)
        end)

        local dhcp_uci = new_uci()
        pcall(function()
            dhcp_uci:foreach("dhcp", "dhcp", function(s)
                if s.interface == "guest_zone" then result.dhcp_ok = true; return false end
            end)
        end)

        local radios = find_radios(uci)

        local band_ui_map = {
            ["2g"]   = "2g",
            ["5g"]   = "5g",
            ["5g_2"] = "5gb",
            ["6g"]   = "6g",
        }

        for uci_band, ui_band in pairs(band_ui_map) do
            local radio_info = radios[uci_band]
            if radio_info then
                local radio_sec = radio_info.radio_sec

                local guest_ifaces = {}
                uci:foreach("wireless", "wifi-iface", function(iface)
                    if iface.device  == radio_sec   and
                       iface.mode    == "ap"         and
                       iface.network == "guest_zone" then
                        guest_ifaces[#guest_ifaces+1] = {
                            iface_sec      = iface[".name"],
                            network        = iface.network        or "guest_zone",
                            ssid           = iface.ssid           or "",
                            enc            = iface.encryption     or "none",
                            key            = iface.key            or "",
                            hidden         = iface.hidden         or "0",
                            disabled       = iface.disabled       or "0",
                            isolate        = iface.isolate        or "1",
                            bss_transition = iface.bss_transition or "0",
                            ieee80211k     = iface.ieee80211k     or "0",
                        }
                    end
                end)

                result.bands[ui_band] = {
                    radio_sec = radio_sec,
                    ifaces    = guest_ifaces,
                }
            end
        end

        respond(result)
    end)
    if not ok then respond({ error = tostring(err) }) end
end

local function handle_save_guest()
    local ok, err = pcall(function()
        local band      = p("band")      or ""
        local radio_sec = p("radio_sec") or ""
        local iface_sec = p("iface_sec") or ""
        local ssid      = p("ssid")      or ""
        local enc       = p("enc")       or "none"
        local key       = p("key")       or ""
        local hidden    = p("hidden")    or "0"
        local disabled  = (p("disabled") == "1") and "1" or "0"
        local isolate   = (p("isolate")  == "0") and "0" or "1"
        local roam      = (p("roam")     == "1") and "1" or "0"
        local ipaddr    = p("ipaddr")    or "192.168.2.1"

        if band == "" or radio_sec == "" then
            respond({ success = false, message = "band and radio_sec are required" })
            return
        end
        if ssid == "" then
            respond({ success = false, message = "SSID is required" })
            return
        end
        local valid_enc = {none=true,psk=true,psk2=true,["psk-mixed"]=true,sae=true}
        if not valid_enc[enc] then enc = "none" end
        if hidden   ~= "1" then hidden   = "0" end
        if disabled ~= "1" then disabled = "0" end

        local uci     = new_uci()
        local changes = {}

        local bare_ip    = ipaddr:match("^(%d+%.%d+%.%d+%.%d+)") or ipaddr
        local store_ip   = bare_ip .. "/24"
        local net_changed = false

        local gnet_exists = (uci:get("network", "guest_zone") ~= nil)
        if not gnet_exists then
            local dev_found = false
            uci:foreach("network", "device", function(s)
                if s.name == "guest_zone" then dev_found = true; return false end
            end)
            if not dev_found then
                local dev_sec = uci:add("network", "device")
                uci:set("network", dev_sec, "type", "bridge")
                uci:set("network", dev_sec, "name", "guest_zone")
            end
            uci:set("network", "guest_zone", "interface")
            uci:set("network", "guest_zone", "proto",  "static")
            uci:set("network", "guest_zone", "ipaddr", store_ip)
            uci:set("network", "guest_zone", "type",   "bridge")
            net_changed = true
            changes[#changes+1] = "Guest network interface created (" .. bare_ip .. "/24)"
        else
            local cur      = uci:get("network", "guest_zone", "ipaddr") or ""
            local cur_bare = cur:match("^(%d+%.%d+%.%d+%.%d+)") or cur
            if cur_bare ~= bare_ip then
                uci:set("network", "guest_zone", "ipaddr", store_ip)
                net_changed = true
                changes[#changes+1] = "Guest subnet updated to " .. bare_ip .. "/24"
            end
        end

        if net_changed then
            uci:commit("network")
            exec("/etc/init.d/network reload 2>/dev/null &")
        end

        local dhcp_exists = false
        uci:foreach("dhcp", "dhcp", function(s)
            if s.interface == "guest_zone" then dhcp_exists = true; return false end
        end)
        if not dhcp_exists then
            setup_guest_dhcp(uci)
            changes[#changes+1] = "DHCP pool created for guest_zone"
        end

        local fw_zone_ok = false
        local fw_dhcp_ok = false
        local fw_dns_ok  = false
        local fw_fwd_ok  = false
        local fw_chk = new_uci()
        fw_chk:foreach("firewall", "zone", function(s)
            if s.name == "guest_zone" then fw_zone_ok = true end
        end)
        fw_chk:foreach("firewall", "rule", function(s)
            if s.name == "Allow-DHCP-Guest" then fw_dhcp_ok = true end
            if s.name == "Allow-DNS-Guest"  then fw_dns_ok  = true end
        end)
        fw_chk:foreach("firewall", "forwarding", function(s)
            if s.src == "guest_zone" and s.dest == "wan" then fw_fwd_ok = true end
        end)
        if not (fw_zone_ok and fw_dhcp_ok and fw_dns_ok and fw_fwd_ok) then
            local fw_changed = setup_guest_firewall()
            if fw_changed then
                changes[#changes+1] = "Firewall rules configured for guest_zone"
            end
        end

        local is_new    = (iface_sec == "")
        local wl_changed = is_new

        if is_new then
            local base = "gst_" .. ssid:lower():gsub("[^%w]", "_"):sub(1, 16)
            iface_sec = base
            local idx = 2
            while uci:get("wireless", iface_sec) do
                iface_sec = base .. "_" .. idx
                idx = idx + 1
            end

            uci:set("wireless", iface_sec, "wifi-iface")
            uci:set("wireless", iface_sec, "device",  radio_sec)
            uci:set("wireless", iface_sec, "mode",    "ap")
            uci:set("wireless", iface_sec, "network", "guest_zone")
            changes[#changes+1] = "Guest SSID created on band " .. band
        end

        local function wl_set(field, val)
            local cur = uci_str(uci, "wireless", iface_sec, field) or ""
            if cur ~= (val or "") then
                uci:set("wireless", iface_sec, field, val)
                wl_changed = true
            end
        end
        local function wl_del(field)
            if uci:get("wireless", iface_sec, field) ~= nil then
                uci:delete("wireless", iface_sec, field)
                wl_changed = true
            end
        end

        wl_set("ssid",       ssid)
        wl_set("encryption", enc)
        if enc ~= "none" and key ~= "" then
            local cur_key = uci_str(uci, "wireless", iface_sec, "key") or ""
            if cur_key ~= key then
                uci:set("wireless", iface_sec, "key", key)
                wl_changed = true
            end
        elseif enc == "none" then
            wl_del("key")
        end
        wl_set("hidden",         hidden)
        wl_set("disabled",       disabled)
        wl_set("isolate",        isolate)
        wl_set("ieee80211k",     roam)
        wl_set("bss_transition", roam)
        if roam == "1" then
            wl_set("time_advertisement", "2")
        else
            wl_del("time_advertisement")
        end

        if wl_changed then
            uci:commit("wireless")
            exec("wifi reload " .. radio_sec .. " 2>/dev/null &")
        end

        if not net_changed and not wl_changed and #changes == 0 then
            respond({
                success   = true,
                iface_sec = iface_sec,
                is_new    = false,
                message   = "No changes.",
                changes   = {},
            })
            return
        end

        respond({
            success   = true,
            iface_sec = iface_sec,
            is_new    = is_new,
            message   = is_new and "Guest network enabled" or "Guest settings saved",
            changes   = changes,
        })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_delete_guest_band()
    local ok, err = pcall(function()
        local iface_sec = p("iface_sec") or ""
        local radio_sec = p("radio_sec") or ""

        if iface_sec == "" then
            respond({ success = false, message = "iface_sec is required" })
            return
        end

        local uci = new_uci()

        local net = uci:get("wireless", iface_sec, "network") or ""
        if net ~= "guest_zone" then
            respond({ success = false, message = "Not a guest interface" })
            return
        end

        uci:delete("wireless", iface_sec)
        uci:commit("wireless")

        local remaining = 0
        uci:foreach("wireless", "wifi-iface", function(iface)
            if iface.network == "guest_zone" and iface.mode == "ap" then
                remaining = remaining + 1
            end
        end)

        if radio_sec ~= "" then
            exec("wifi reload " .. radio_sec .. " 2>/dev/null &")
        else
            exec("wifi reload 2>/dev/null &")
        end

        respond({
            success           = true,
            message           = "Guest SSID removed",
            guest_ifaces_left = remaining,
        })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

local function handle_status_guest()
    local ok, err = pcall(function()
        local result = {
            active     = false,
            clients_2g = 0,
            clients_5g = 0,
            clients_6g = 0,
            ipaddr     = nil,
        }

        local ok_ub, conn = pcall(ubus.connect)
        if ok_ub and conn then
            local ok2, iface_st = pcall(function()
                return conn:call("network.interface.guest_zone", "status", {})
            end)
            if ok2 and iface_st then
                if iface_st.up == true then
                    result.active = true
                end
                local addrs = iface_st["ipv4-address"]
                if type(addrs) == "table" and addrs[1] then
                    result.ipaddr = addrs[1].address
                end
            end
        end

        if not result.active then
            local br_state = read_sysfs("/sys/class/net/br-guest_zone/operstate")
            if br_state == "up" or br_state == "unknown" then
                local br_addr = read_sysfs("/sys/class/net/br-guest_zone/address")
                if br_addr and br_addr ~= "" and br_addr ~= "00:00:00:00:00:00" then
                    result.active = true
                end
            end
        end

        if not result.active then
            local iface_state = read_sysfs("/sys/class/net/guest_zone/operstate")
            if iface_state == "up" or iface_state == "unknown" then
                result.active = true
            end
        end

        if not result.ipaddr then
            result.ipaddr = read_sysfs("/tmp/network/interface/guest_zone/ipaddr")
                         or read_sysfs("/tmp/network/interface/guest_zone/address")
        end

        if ok_ub and conn then
            local uci = new_uci()
            uci:foreach("wireless", "wifi-iface", function(iface)
                if iface.network ~= "guest_zone" or iface.mode ~= "ap" then return end
                local phy_name = iface.ifname or iface[".name"]
                local ok3, clients = pcall(function()
                    return conn:call("hostapd." .. phy_name, "get_clients", {})
                end)
                if ok3 and clients and type(clients.clients) == "table" then
                    local count = 0
                    for _ in pairs(clients.clients) do count = count + 1 end
                    local dev        = iface.device or ""
                    local radio_band = (uci:get("wireless", dev, "band") or ""):lower()
                    if radio_band == "2g" then
                        result.clients_2g = result.clients_2g + count
                    elseif radio_band == "6g" then
                        result.clients_6g = result.clients_6g + count
                    else
                        result.clients_5g = result.clients_5g + count
                    end
                end
            end)
            pcall(function() conn:close() end)
        end

        respond(result)
    end)
    if not ok then respond({ active = false, error = tostring(err) }) end
end

local function handle_fix_guest_dependencies()
    local ok, err = pcall(function()
        local uci = new_uci()
        local changes = {}

        if not uci:get("network", "guest_zone") then
            local ip = find_free_guest_subnet(uci)
            local dev_found = false
            uci:foreach("network", "device", function(s)
                if s.name == "guest_zone" then dev_found = true; return false end
            end)
            if not dev_found then
                local dev_sec = uci:add("network", "device")
                uci:set("network", dev_sec, "type", "bridge")
                uci:set("network", dev_sec, "name", "guest_zone")
            end
            uci:set("network", "guest_zone", "interface")
            uci:set("network", "guest_zone", "proto", "static")
            uci:set("network", "guest_zone", "ipaddr", ip.."/24")
            uci:set("network", "guest_zone", "type", "bridge")
            uci:commit("network")
            exec("/etc/init.d/network reload 2>/dev/null &")
            table.insert(changes, "Created guest network interface ("..ip..")")
        else
            exec("ifup guest_zone 2>/dev/null")
            table.insert(changes, "Ensured guest network interface is active")
        end

        local dhcp_found = false
        uci:foreach("dhcp", "dhcp", function(s)
            if s.interface == "guest_zone" then dhcp_found = true; return false end
        end)
        if not dhcp_found then
            setup_guest_dhcp(uci)
            table.insert(changes, "Configured DHCP for guest network")
        end

        if setup_guest_firewall() then
            table.insert(changes, "Configured firewall rules for guest network")
        end

        respond({ success = true, changes = changes })
    end)
    if not ok then respond({ success = false, message = tostring(err) }) end
end

-- ════════════════════════════════════════════════════════════════════════════
--  Dispatch
-- ════════════════════════════════════════════════════════════════════════════

local handlers = {
    get_config             = handle_get_config,
    get_ap_config          = handle_get_ap_config,
    get_radio_config       = handle_get_radio_config,
    get_radio_capabilities = handle_get_radio_capabilities,
    status_wan             = handle_status_wan,
    status_wireless        = handle_status_wireless,
    get_channels           = handle_get_channels,
    get_wan_devices        = handle_get_wan_devices,
    get_smart_ap_config    = handle_get_smart_ap_config,
    get_guest_config       = handle_get_guest_config,
    status_guest           = handle_status_guest,
    save_wan               = handle_save_wan,
    save_wireless          = handle_save_wireless,
    reconnect_wan          = handle_reconnect_wan,
    delete_iface           = handle_delete_iface,
    save_offload           = handle_save_offload,
    save_pkt_steering      = handle_save_pkt_steering,
    save_smart_ap          = handle_save_smart_ap,
    delete_smart_ap        = handle_delete_smart_ap,
    save_guest             = handle_save_guest,
    delete_guest_band      = handle_delete_guest_band,
    fix_guest_dependencies = handle_fix_guest_dependencies,
}

local fn = handlers[method]
if fn then
    local ok, err = pcall(fn)
    if not ok then respond({ error = "handler crashed: " .. tostring(err) }) end
else
    respond({ error = "unknown method: " .. tostring(method) })
end
