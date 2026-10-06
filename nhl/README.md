# NHL Universe 2D — Alpha 0.1

Aplicativo em HTML/CSS/JavaScript para simulação/gerenciamento de NHL.

## Conteúdo desta versão
- 32 franquias NHL.
- Logos via assets oficiais da NHL.
- Elencos atuais via `https://api-web.nhle.com/v1/roster/{TEAM}/current`.
- Fotos/headshots fornecidos pelo payload oficial quando disponíveis.
- Prospectos via `https://api-web.nhle.com/v1/prospects/{TEAM}`.
- 35 atributos de 0 a 100.
- Conjunto de atributos separado para skaters e goaltenders.
- Arenas por franquia.
- Rivalidades com `RivalryScore` inicial.
- Histórico da Stanley Cup de 1927 a 2026.
- Protótipo de rink 2D.
- Busca de atletas e fichas individuais.

## Ratings
Os ratings NÃO são ratings oficiais da NHL, EA Sports ou de qualquer outra empresa.
São ratings próprios e determinísticos do simulador, gerados por posição e dados biográficos básicos.

## Fotos e logos
As imagens NÃO estão incorporadas fisicamente ao ZIP. O app referencia URLs retornadas pela API/servidores de assets da NHL.
Isso mantém o ZIP leve e reduz duplicação de material proprietário.

## Como abrir
Você pode abrir `index.html` diretamente no navegador.
Se o navegador bloquear chamadas externas ao abrir um arquivo local, execute `start_server.bat`
e abra `http://localhost:8000`.

## Próxima etapa recomendada
- depth charts / lines;
- coaches e front office;
- contratos e salary cap;
- draft picks;
- engine de trades;
- lesões;
- temporada;
- motor 2D real com skating, passing, shooting, checks e goalies.
