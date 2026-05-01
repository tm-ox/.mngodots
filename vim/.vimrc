"""""""""
""VIMRC""
"""""""""

source ~/.vim/plugins.vim

"SETTINGS {{{
set nocompatible
set termguicolors
filetype plugin indent on
syntax on
set autoread
set history=1000
set path+=**
set wildmenu
set wildmode=longest:full,full
set wildignorecase
set wildignore=*.git/*,*.tags,tags,*.o,*.class
set wildignore+=*node_modules/*
set wildignore+=*dist/*
set wildignore+=*.log
set number relativenumber
set cursorline
set shiftwidth=4
set autoindent
set smartindent
set tabstop=4
set softtabstop=4
set expandtab
set nobackup
set scrolloff=8
set sidescrolloff=8
set lbr
set showcmd
set showmode
set cmdheight=1
augroup filetype_vim
 autocmd!
	autocmd FileType vim setlocal foldmethod=marker
augroup END
set incsearch
set ignorecase
set smartcase
set showmatch
set hlsearch
set splitbelow splitright
command! WipeReg for i in range(34,122) | silent! call setreg(nr2char(i), []) | endfor

"Cursor
let &t_SI = "\e[6 q"
let &t_EI = "\e[2 q"
let &t_SR = "\e[4 q"
"let &t_Cs = "\e]12;215\x7" "Set cursor color to 215 (light orange)

"StatusLine
set statusline= "Clear statusline on load
set statusline+=\ %F\ %M\ %Y\ %R
set statusline+=%=
set statusline+=\ ascii:\ %b\ hex:\ 0x%B\ row:\ %l\ col:\ %c\ percent:\ %p%%
set laststatus=2 "Statusline position
"}}}

"VISUAL {{{
"Initialisation {{{
hi clear
if exists("syntax_on")
 syntax reset
endif
let g:colors_name = "tm"
let &background = "dark"
"}}}

"Palette {{{
let s:fg = "#929292"
let s:bg = "NONE"
let s:comment = "#5C6773"
let s:string = "#B8CC52"
let s:constant = "#FFEE99"
let s:function = "#FFB454"
let s:keyword = "#ff9e64"
let s:operator = "#E7C547"
let s:tag = "#36A3D9"
let s:special = "#A08DBB"
let s:regexp = "#95E6CB"
let s:markup = "#E03616"
let s:error = "#E03616"
let s:accent = "#ff9e64"
let s:panel = "#292e42"
let s:line = "#292e42"
let s:selection = "#7c7f93"
let s:guide = "#646A83"
let s:fg_idle = "#646A83"
" 16-bit cterm approximations for fallback
let s:cterm_fg = "white"
let s:cterm_bg = "none"
let s:cterm_comment = "darkgray"
let s:cterm_string = "green"
let s:cterm_constant = "yellow"
let s:cterm_function = "yellow"
let s:cterm_keyword = "brown"
let s:cterm_operator = "yellow"
let s:cterm_tag = "cyan"
let s:cterm_special = "magenta"
let s:cterm_regexp = "cyan"
let s:cterm_markup = "red"
let s:cterm_error = "red"
let s:cterm_accent = "brown"
let s:cterm_panel = "black"
let s:cterm_line = "black"
let s:cterm_selection = "darkgray"
let s:cterm_guide = "darkgray"
let s:cterm_fg_idle = "darkgray"
"}}}

"Highlighting {{{
execute "hi! Normal guifg=" . s:fg . " guibg=" . s:bg . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_bg
execute "hi! ColorColumn guibg=" . s:line . " ctermbg=" . s:cterm_line
execute "hi! CursorColumn guibg=" . s:line . " ctermbg=" . s:cterm_line
execute "hi! CursorLine guibg=" . s:line . " gui=NONE" . " ctermbg=" . s:cterm_line . " cterm=NONE"
execute "hi! CursorLineNr guifg=" . s:accent . " guibg=" . s:line . " ctermfg=" . s:cterm_accent . " ctermbg=" . s:cterm_line
execute "hi! Cursor guifg=" . s:accent . " guibg=" . s:accent . " ctermfg=" . s:cterm_accent . " ctermbg=" . s:cterm_line
execute "hi! LineNr guifg=" . s:guide . " ctermfg=" . s:cterm_guide
execute "hi! Directory guifg=" . s:fg_idle . " ctermfg=" . s:cterm_fg_idle
execute "hi! DiffAdd guifg=" . s:string . " guibg=" . s:panel . " ctermfg=" . s:cterm_string . " ctermbg=" . s:cterm_panel
execute "hi! DiffChange guifg=" . s:tag . " guibg=" . s:panel . " ctermfg=" . s:cterm_tag . " ctermbg=" . s:cterm_panel
execute "hi! DiffText guifg=" . s:fg . " guibg=" . s:panel . " gui=bold" . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_panel . " cterm=bold"
execute "hi! ErrorMsg guifg=" . s:fg . " guibg=" . s:error . " gui=standout" . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_error . " cterm=reverse"
execute "hi! VertSplit guifg=" . s:line . " guibg=" . s:line . " ctermfg=" . s:cterm_line . " ctermbg=" . s:cterm_line
execute "hi! Folded guifg=" . s:fg_idle . " guibg=" . s:panel . " ctermfg=" . s:cterm_fg_idle . " ctermbg=" . s:cterm_panel
execute "hi! FoldColumn guibg=" . s:panel . " ctermbg=" . s:cterm_panel
execute "hi! SignColumn guibg=" . s:panel . " ctermbg=" . s:cterm_panel
execute "hi! MatchParen guifg=" . s:fg . " guibg=" . s:bg . " gui=underline" . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_bg . " cterm=underline"
execute "hi! ModeMsg guifg=" . s:string . " ctermfg=" . s:cterm_string
execute "hi! MoreMsg guifg=" . s:string . " ctermfg=" . s:cterm_string
execute "hi! NonText guifg=" . s:guide . " ctermfg=" . s:cterm_guide
execute "hi! Pmenu guifg=" . s:fg . " guibg=" . s:selection . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_selection
execute "hi! PmenuSel guifg=" . s:fg . " guibg=" . s:selection . " gui=reverse" . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_selection . " cterm=reverse"
execute "hi! Question guifg=" . s:string . " ctermfg=" . s:cterm_string
execute "hi! Search guifg=" . s:fg_idle . " guibg=" . s:panel . " ctermfg=" . s:cterm_fg_idle . " ctermbg=" . s:cterm_panel
execute "hi! SpecialKey guifg=" . s:selection . " ctermfg=" . s:cterm_selection
execute "hi! SpellCap guifg=" . s:tag . " gui=underline" . " ctermfg=" . s:cterm_tag . " cterm=underline"
execute "hi! SpellLocal guifg=" . s:keyword . " gui=underline" . " ctermfg=" . s:cterm_keyword . " cterm=underline"
execute "hi! SpellBad guifg=" . s:error . " gui=underline" . " ctermfg=" . s:cterm_error . " cterm=underline"
execute "hi! SpellRare guifg=" . s:regexp . " gui=underline" . " ctermfg=" . s:cterm_regexp . " cterm=underline"
execute "hi! StatusLine guifg=" . s:fg_idle . " guibg=" . s:panel . " ctermfg=". s:cterm_fg_idle . " ctermbg=" . s:cterm_panel
execute "hi! StatusLineNC guifg=" . s:panel . " guibg=" . s:fg_idle . " ctermfg=" . s:cterm_panel . " ctermbg=" . s:cterm_fg_idle
execute "hi! WildMenu guifg=" . s:bg . " guibg=" . s:markup . " ctermfg=" . s:cterm_bg . " ctermbg=" . s:cterm_markup
execute "hi! TabLine guifg=" . s:fg . " guibg=" . s:panel . " gui=reverse" . " ctermfg=" . s:cterm_fg . " ctermbg=" . s:cterm_panel . " cterm=reverse"
execute "hi! Title guifg=" . s:keyword . " ctermfg=" . s:cterm_keyword
execute "hi! Visual guifg=" . s:fg_idle . " guibg=" . s:panel . " ctermfg=" . s:cterm_fg_idle . " ctermbg=" . s:cterm_panel
execute "hi! WarningMsg guifg=" . s:error . " ctermfg=" . s:cterm_error
hi! LongLineWarning guibg=#371F1C gui=underline ctermbg=darkred cterm=underline
"}}}

"Generic Syntax Highlighting {{{
execute "hi! Comment guifg=" . s:comment
execute "hi! Constant guifg=" . s:constant
execute "hi! String guifg=" . s:string
execute "hi! Identifier guifg=" . s:tag
execute "hi! Function guifg=" . s:function
execute "hi! Statement guifg=" . s:keyword
execute "hi! Operator guifg=" . s:operator
execute "hi! PreProc guifg=" . s:special
execute "hi! Type guifg=" . s:tag
execute "hi! Structure guifg=" . s:special
execute "hi! Special guifg=" . s:special
execute "hi! Underlined guifg=" . s:tag . " gui=underline"
hi! Ignore guifg=NONE guibg=NONE
execute "hi! Error guifg=" . s:fg . " guibg=" . s:error
execute "hi! Todo guifg=" . s:markup
execute "hi! Conceal guifg=" . s:guide
execute "hi! CursorLineConceal guifg=" . s:guide . " guibg=" . s:line
"}}}
"}}}

"KEYBINDS {{{
" General {{{
nnoremap ; :
let mapleader = " "
"map <Leader>r c :source ~/.vimrc<CR>
map <esc> :noh <CR>
map <C-s> :set spell!<CR>
noremap <Leader>q :q<CR>
noremap <Leader>w :up<CR>
nnoremap Y y$
nnoremap j gj
vnoremap j gj
nnoremap k gk
noremap k gk
nnoremap <Down> gj
nnoremap <Up> gk
noremap <silent> <C-y> :w !wl-copy<CR><CR>
noremap <silent> <C-p> :r !wl-paste<CR>
"Centre jumps
noremap n nzz
noremap N Nzz
noremap { {zz
noremap } }zz
noremap <C-u> <C-u>zz
noremap <C-d> <C-d>zz
noremap <C-f> <C-f>zz
noremap <C-b> <C-b>zz
noremap <PageUp> <C-b>zz
noremap <PageDown> <C-f>zz
"Move lines / selection
noremap <A-k> :m '>-2<CR>gv=gv<CR>
nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
inoremap <A-j> <Esc>:m .+1<CR>==gi
inoremap <A-k> <Esc>:m .-2<CR>==gi
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv
"}}}

"Explore {{{
"Show currebt directory
nnoremap <leader>a :argadd <c-r>=fnameescape(expand('%:p:h'))<cr>/*<C-d>
"Toggle Ex
let g:NetrwIsOpen=0
function! ToggleNetrw()
 if g:NetrwIsOpen
 let i = bufnr("$")
 while (i >= 1)
 if (getbufvar(i, "&filetype") == "netrw")
 silent exe "bwipeout " . i
 endif
 let i-=1
 endwhile
 let g:NetrwIsOpen=0
 else
 let g:NetrwIsOpen=1
 silent 20Lexplore!
 endif
endfunction
noremap <silent> <Leader>e :call ToggleNetrw()<CR>
noremap <silent> <Leader>f :find<space>
"}}}

"Buffers {{{
nnoremap <Tab> :bn<CR>
nnoremap <S-Tab> :bp<CR>
nnoremap <Leader>b :buffers<CR>:b<space>
"}}}

"Splits {{{
nnoremap <Leader>r :buffers<CR>:b<space>
nnoremap <Leader>l :vsplit<CR>
nnoremap <Leader>j :split<CR>
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-h> <C-w>h
nnoremap <C-l> <C-w>l
:nnoremap <silent> <C-Up> :resize -1<CR>
:nnoremap <silent> <C-Down> :resize +1<CR>
:nnoremap <silent> <C-left> :vertical resize -1<CR>
:nnoremap <silent> <C-right> :vertical resize +1<CR>
"}}}

"Tabs {{{
nnoremap <A-Tab> :tabnext<CR>
nnoremap <S-A-Tab> :tabprevious<CR>
"}}}
"}}}
