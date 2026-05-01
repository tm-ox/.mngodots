nnoremap ; :
let mapleader = " "
noremap <Leader>q :q<CR>
noremap <Leader>w :up<CR>
nnoremap <silent> <leader> :WhichKey '<Space>'<CR>
map <C-u> :source ~/.vimrc<CR>
map <esc> :noh <CR>
map <C-s> :set spell!<CR>
noremap <Leader>e :NERDTreeToggle<CR>
map <Leader>t :bo term ++close<Cr>
tmap <Leader>t <C-w>:term ++close<Cr>
nnoremap <Leader>f :Files<CR>
nnoremap <Leader>b :Buffers<CR>
nnoremap <Leader>l :Lines<CR>
nnoremap <Leader>h :History<CR>
nnoremap <Leader>r :reg<CR>
nnoremap <Leader><S-r> :WipeReg<CR>
"nnoremap <Leader>b :buffers<CR>:b<space>
nnoremap <Leader><Tab> :bn<CR>
nnoremap Y y$
nnoremap j gj
vnoremap j gj
nnoremap k gk
noremap k gk
nnoremap <Down> gj
nnoremap <Up> gk
nnoremap <Leader>j :m .+1<CR>==
nnoremap <Leader>k :m .-2<CR>==
inoremap <Leader>j <Esc>:m .+1<CR>==gi
inoremap <Leader>k <Esc>:m .-2<CR>==gi
vnoremap <Leader>j :m '>+1<CR>gv=gv
vnoremap <Leader>k :m '<-2<CR>gv=gv
xnoremap <C-y> :w !wl-copy<CR><CR>
noremap <C-p> :r !wl-paste<CR><CR>
"SPLTS
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-h> <C-w>h
nnoremap <C-l> <C-w>l
:nnoremap <silent> <C-Up> :resize -1<CR>
:nnoremap <silent> <C-Down> :resize +1<CR>
:nnoremap <silent> <C-left> :vertical resize -1<CR>
:nnoremap <silent> <C-right> :vertical resize +1<CR>
"Quarto
map <leader>ep :w !quarto render % --to typst<CR>
