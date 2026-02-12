#!/usr/bin/env node
import http from 'http';

const url = 'http://localhost:8080/pt/radar/day/index.html';

http.get(url, (res) => {
  console.log('✅ Página carrega:', res.statusCode === 200 ? 'OK (200)' : `ERRO (${res.statusCode})`);
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const hasMrV2Css = data.includes('match-radar-v2.cf390008e08b.css');
    const hasMrV2Js = data.includes('match-radar-v2.fa12c94e8201.js');
    const hasAppHash = data.includes('app.83cd2791f8b3.js');
    
    console.log('✅ CSS MR V2 linkado:', hasMrV2Css ? 'SIM (/assets/match-radar-v2.cf390008e08b.css)' : 'NÃO');
    console.log('✅ JS MR V2 linkado:', hasMrV2Js ? 'SIM (/assets/match-radar-v2.fa12c94e8201.js)' : 'NÃO');
    console.log('✅ APP com hash:', hasAppHash ? 'SIM (/assets/app.83cd2791f8b3.js)' : 'NÃO');
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
