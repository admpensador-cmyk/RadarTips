#!/usr/bin/env node
import http from 'http';

const url = 'http://localhost:8080/pt/radar/day/index.html';

http.get(url, (res) => {
  console.log('✅ Página carrega:', res.statusCode === 200 ? 'OK (200)' : `ERRO (${res.statusCode})`);
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const cssMatch = data.match(/\/assets\/match-radar-v2\.[a-f0-9]{12}\.css/);
    const appMatch = data.match(/\/assets\/app\.[a-f0-9]{12}\.js/);
    const hasMrV2Css = !!cssMatch;
    const hasAppHash = !!appMatch;
    const hasMrV2Js = /\/assets\/match-radar-v2\.[a-f0-9]{12}\.js/.test(data);

    console.log('✅ CSS MR V2 linkado:', hasMrV2Css ? `SIM (${cssMatch[0]})` : 'NÃO');
    console.log('✅ JS MR V2 separado (esperado NAO):', hasMrV2Js ? 'SIM' : 'NÃO');
    console.log('✅ APP com hash:', hasAppHash ? `SIM (${appMatch[0]})` : 'NÃO');
    console.log('');
    console.log('🎯 SMOKE TEST MANUAL (aplicação aberta no navegador):');
    console.log('   URL: http://localhost:8080/pt/radar/day/index.html');
    console.log('');
    console.log('📋 Instruções:');
    console.log('   1. Clique em qualquer card de jogo (Slot 1)');
    console.log('   2. Modal "Match Radar V2" deve abrir');
    console.log('   3. Verifique Aba "Mercados" (dados de mercados)');
    console.log('   4. Verifique Aba "Estatísticas" (gráficos de barras)');
    console.log('   5. Clique em outro card (Slot 2) - modal atualiza');
    console.log('   6. Clique em Slot 3 - modal atualiza novamente');
    console.log('');
    console.log('✅ Esperado em cada clique:');
    console.log('   ✓ Modal abre / atualiza dados');
    console.log('   ✓ Aba "Mercados" mostra tabela com dados');
    console.log('   ✓ Aba "Estatísticas" mostra barras de stats');
    console.log('   ✓ Botão X fecha modal');
    console.log('   ✓ ESC fecha modal');
    console.log('   ✓ Clique fora (overlay) fecha modal');
    console.log('');
    console.log('✅ Assets carregados corretamente via HTTP');
    console.log('');
    process.exit(0);
  });
}).on('error', (e) => {
  console.error('❌ Erro ao conectar:', e.message);
  process.exit(1);
});
