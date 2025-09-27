# Diagnóstico – Reordenação da lista de Prompts

## Fonte de verdade da ordem
- A listagem é alimentada por `usePromptList`, que consulta `GET /api/v1/prompts` e aplica `sortPrompts` para ordenar por `position`, com desempate por `createdAt` e `id`. Essa seleção é reaproveitada por toda a página, tornando a resposta da API (já ordenada) o estado canônico exibido ao usuário.
- Durante o drag, a página mantém um vetor local `sortedIds` sincronizado com os prompts filtrados. Esse vetor controla a renderização e é reinicializado sempre que os dados vindos do backend mudam ou quando filtros impedem reordenar.
- Antes de persistir, `requestReorder` normaliza os itens com posições sequenciais (`normalizeOrder`) e envia o payload resultante para `PUT /api/v1/prompts/reorder`, delegando a validação e a gravação definitiva ao backend.

## Fluxo atual de drag & drop
1. Sensores do `DndContext` (pointer + teclado) habilitam o arraste quando não há filtros ativos e nenhuma mutação de reorder pendente.
2. `handleDragStart` guarda o `activeId` para exibir o item em `DragOverlay` e desativar a virtualização durante o arraste.
3. `handleDragOver` atualiza `sortedIds` via `arrayMove`, produzindo o preview imediato da nova ordem enquanto o item passa por outros cards ou pela dropzone de “enviar para o fim”.
4. `handleDragEnd` reseta o `activeId` e, quando há alvo válido, delega a `requestReorder`, que dispara a mutação `reorderPrompts.mutate`.
5. A mutação ativa um optimistic update (`onMutate` copia a nova ordem para o cache do React Query) e invalida a query ao concluir, fazendo um refetch para confirmar o estado salvo pelo backend.

## Persistência e concorrência
- O optimistic update mantém a lista visualmente atualizada enquanto o servidor processa. Caso a API retorne erro, `onError` restaura o snapshot anterior do cache.
- Enquanto `reorderPrompts.isPending` é verdadeiro, `canReorder` fica falso, impedindo novos arrastes até o término da requisição. Não há tratamento adicional para múltiplas abas ou race conditions; o backend resolve conflitos apenas com uma transação que zera as posições e reaplica a sequência recebida.

## Causa do rollback prematuro
- Após o drop, `sortedIds` recebe o novo arranjo e `requestReorder` dispara a mutação. Entretanto, o `useEffect` que sincroniza `sortedIds` com `promptIdList` roda sempre que `promptIdList` muda **e** nenhum drag/async está ativo. Como o cache ainda contém a ordem antiga até o optimistic update ser aplicado, o efeito reenfileira `setSortedIds(promptIdList)`, voltando o UI para o estado anterior antes mesmo da resposta do servidor. Assim que o cache é atualizado, a lista “anda para frente” novamente, gerando o rollback visível.

## Lacunas de UX identificadas
- Não há indicador persistente de “item arrastável” além do cursor grab no handle; o card inteiro não comunica affordance de drag.
- Durante o arraste, falta placeholder/ghost entre itens para indicar o alvo exato onde o card será solto; apenas o deslocamento abrupto sugere a nova posição.
- O item ativo só ganha opacidade reduzida; não há destaque claro ou sombra pronunciada que o diferencie do restante.
- A dropzone inferior é o único alvo explícito, mas não existe realce entre cards ou feedback visual para quedas intermediárias.
- Não há auto-scroll programático: se o usuário arrasta próximo às bordas de um container alto, o scroll não avança sozinho, dificultando mover itens longos.
- Não há animações de transição personalizadas; os cards dependem apenas do `transition-transform` padrão aplicado pelo `SortableContext`, resultando em movimento brusco.

## Requisitos sugeridos para o ajuste
- Garantir que `sortedIds` não seja sincronizado de volta enquanto houver reorder em andamento ou até que o cache reflita o optimistic update, eliminando o rollback prematuro.
- Reforçar o feedback visual de drag (cursor e estilo do card) e introduzir um placeholder/ghost claro que mostre a posição alvo.
- Destacar o card arrastado (ex.: sombra, escala) e sinalizar o destino (ex.: borda/linha de inserção) durante o hover.
- Implementar auto-scroll suave do container quando o ponteiro se aproxima dos limites, especialmente com listas longas/virtualizadas.
- Avaliar animações de transição (ex.: framer-motion ou layout animations do dnd-kit) para suavizar a movimentação entre estados.
- Considerar bloqueios visuais ou avisos caso outra aba mude a ordem para evitar surpresas após o refetch.
