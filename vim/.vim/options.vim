set nocompatible
filetype plugin indent on
syntax on
set autoread
set history=1000
set wildmenu
set wildmode=list:longest
set number relativenumber
set cursorline
set shiftwidth=4
set autoindent
set smartindent
set tabstop=4
set softtabstop=4
set expandtab
set nobackup
set scrolloff=999
set lbr
set showcmd
set showmode
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
