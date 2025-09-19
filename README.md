# lkdposts
Auto generation of linkedin posts from RSS feeds

## Projects
- ackend: API Express com o endpoint /hello
- rontend: interface React com Tailwind que consome o endpoint e exibe a mensagem

## Como executar

### Backend
1. Instale as dependencias: 
pm install
2. Inicie o servidor: 
pm start
3. O endpoint ficara disponivel em http://localhost:3001/hello

### Frontend
1. Instale as dependencias: 
pm install
2. Defina a variavel VITE_API_URL se quiser apontar para outro backend (opcional)
3. Inicie o app: 
pm run dev
4. A pagina em http://localhost:5173 ira buscar o texto do backend e exibir no centro da tela
