" tm - a minimal colorscheme

" Initialisation
hi clear
if exists("syntax_on")
  syntax reset
endif

let g:colors_name = "tm"
let &background = "dark"

" --- Palette ---
let s:fg        = "#E6E1CF"
let s:bg        = "NONE"
let s:comment   = "#5C6773"
let s:string    = "#B8CC52"
let s:constant  = "#FFEE99"
let s:function  = "#FFB454"
let s:keyword   = "#ff9e64"
let s:operator  = "#E7C547"
let s:tag       = "#36A3D9"
let s:special   = "#A08DBB"
let s:regexp    = "#95E6CB"
let s:markup    = "#E03616"
let s:error     = "#E03616"
let s:accent    = "#ff9e64"
let s:panel     = "#292e42"
let s:line      = "#292e42"
let s:selection = "#7c7f93"
let s:guide     = "#646A83"
let s:fg_idle   = "#646A83"

" --- Highlighting ---
execute "hi! Normal        guifg=" . s:fg . " guibg=" . s:bg
execute "hi! ColorColumn   guibg=" . s:line
execute "hi! CursorColumn  guibg=" . s:line
execute "hi! CursorLine    guibg=" . s:line . " gui=NONE"
execute "hi! CursorLineNr  guifg=" . s:accent . " guibg=" . s:line
execute "hi! LineNr        guifg=" . s:guide
execute "hi! Directory     guifg=" . s:fg_idle
execute "hi! DiffAdd       guifg=" . s:string . " guibg=" . s:panel
execute "hi! DiffChange    guifg=" . s:tag . " guibg=" . s:panel
execute "hi! DiffText      guifg=" . s:fg . " guibg=" . s:panel . " gui=bold"
execute "hi! ErrorMsg      guifg=" . s:fg . " guibg=" . s:error . " gui=standout"
execute "hi! VertSplit     guifg=" . s:bg . " guibg=" . s:bg
execute "hi! Folded        guifg=" . s:fg_idle . " guibg=" . s:panel
execute "hi! FoldColumn    guibg=" . s:panel
execute "hi! SignColumn    guibg=" . s:panel
execute "hi! MatchParen    guifg=" . s:fg . " guibg=" . s:bg . " gui=underline"
execute "hi! ModeMsg       guifg=" . s:string
execute "hi! MoreMsg       guifg=" . s:string
execute "hi! NonText       guifg=" . s:guide
execute "hi! Pmenu         guifg=" . s:fg . " guibg=" . s:selection
execute "hi! PmenuSel      guifg=" . s:fg . " guibg=" . s:selection . " gui=reverse"
execute "hi! Question      guifg=" . s:string
execute "hi! Search        guibg=" . s:constant . " guifg=" . s:bg
execute "hi! SpecialKey    guifg=" . s:selection
execute "hi! SpellCap      guifg=" . s:tag . " gui=underline"
execute "hi! SpellLocal    guifg=" . s:keyword . " gui=underline"
execute "hi! SpellBad      guifg=" . s:error . " gui=underline"
execute "hi! SpellRare     guifg=" . s:regexp . " gui=underline"
execute "hi! StatusLine    guifg=" . s:accent . " guibg=" . s:panel
execute "hi! StatusLineNC  guifg=" . s:panel . " guibg=" . s:fg_idle
execute "hi! WildMenu      guifg=" . s:bg . " guibg=" . s:markup
execute "hi! TabLine       guifg=" . s:fg . " guibg=" . s:panel . " gui=reverse"
execute "hi! Title         guifg=" . s:keyword
execute "hi! Visual        guibg=" . s:selection
execute "hi! WarningMsg    guifg=" . s:error

hi! LongLineWarning guibg=#371F1C gui=underline

" Generic Syntax Highlighting
execute "hi! Comment         guifg=" . s:comment
execute "hi! Constant        guifg=" . s:constant
execute "hi! String          guifg=" . s:string
execute "hi! Identifier      guifg=" . s:tag
execute "hi! Function        guifg=" . s:function
execute "hi! Statement       guifg=" . s:keyword
execute "hi! Operator        guifg=" . s:operator
execute "hi! PreProc         guifg=" . s:special
execute "hi! Type            guifg=" . s:tag
execute "hi! Structure       guifg=" . s:special
execute "hi! Special         guifg=" . s:special
execute "hi! Underlined      guifg=" . s:tag . " gui=underline"
hi! Ignore          guifg=NONE guibg=NONE
execute "hi! Error           guifg=" . s:fg . " guibg=" . s:error
execute "hi! Todo            guifg=" . s:markup

execute "hi! Conceal         guifg=" . s:guide
execute "hi! CursorLineConceal guifg=" . s:guide . " guibg=" . s:line
