# RadarTips: Atualização e publicação automatizada

Este script executa a sequência completa para garantir que todas as competições cobertas estejam sempre visíveis no site, sem dados obsoletos ou etapas manuais.

## Passos executados:
1. **Regenerar allowlist**: Atualiza a lista de competições cobertas a partir do seed editável pelo PO.
2. **Rebuild dist**: Gera todos os arquivos estáticos e dados para o frontend, incluindo `radar_day.json` e `calendar_2d.json`.
3. **Deploy para produção**: Publica o conteúdo atualizado para o site, garantindo que todas as mudanças estejam visíveis imediatamente.

## Uso

```sh
bash tools/refresh_and_deploy.sh
```

## Requisitos
- Node.js
- Wrangler CLI
- Permissões para publicar no projeto `radartips`

## Observações
- Certifique-se de que o seed (`tools/coverage_allowlist.seed.json`) está atualizado antes de rodar o script.
- O script aborta em caso de erro em qualquer etapa.
- Para automação, agende este script via CI/CD ou cron.
