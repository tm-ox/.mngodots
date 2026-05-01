colorscheme nord
set background=dark
hi Normal guibg=NONE ctermbg=NONE
highlight LineNr ctermfg=grey ctermbg=NONE
hi Visual cterm=NONE ctermfg=215 gui=NONE guifg=White
highlight Comment ctermfg=darkgrey guifg=darkgrey
"CURSOR
let &t_SI = "\e[6 q"
let &t_EI = "\e[2 q"
let &t_SR = "\e[4 q"
let &t_Cs = "\e]12;215\x7" "Set cursor color to 215 (light orange)
highlight Error cterm=underline gui=underline
highlight Warning cterm=underline gui=underline
highlight Error cterm=underline ctermbg=NONE gui=underline guibg=NONE
"STATUS LINE
set statusline= "Clear statusline on load
set statusline+=\ %F\ %M\ %Y\ %R
set statusline+=%=
set statusline+=\ ascii:\ %b\ hex:\ 0x%B\ row:\ %l\ col:\ %c\ percent:\ %p%%
set laststatus=2 "Statusline position
