require("max-preview")

Status:children_add(function()
    local h = cx.active.current.hovered
    return ui.Line({
        ui.Span(os.date(_, tostring(h.cha.mtime):sub(1, 10))):fg("#929292"),
        ui.Span(" "),
    })
end, 500, Status.RIGHT)

function Linemode:size_and_mtime()
	local time = math.floor(self._file.cha.mtime or 0)
	if time == 0 then
		time = ""
	elseif os.date("%Y", time) == os.date("%Y") then
		time = os.date("%Y-%m-%d %H:%M", time)
	else
		time = os.date("%Y-%m-%d", time)
	end

	local size = self._file:size()
	return string.format("%s %s", size and ya.readable_size(size) or "", time)
end
