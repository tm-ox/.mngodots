let g:prettier#exec_cmd_path = '/home/tm/.nvm/versions/node/v20.19.3/bin/prettier'

call plug#begin()

Plug 'prettier/vim-prettier', {
  \ 'do': 'yarn install --frozen-lockfile --production',
  \ 'for': ['javascript', 'typescript', 'scss', 'json', 'markdown', 'svelte', 'yaml', 'html', 'javascriptreact', 'typescriptreact', 'css', 'less', 'graphql', 'jsonc']
\ }

Plug 'dhruvasagar/vim-table-mode'

call plug#end()
