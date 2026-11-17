# Modelos 3D de atletas (Meshy AI)

| Arquivo | Uso | Origem |
|---|---|---|
| `football_player.glb` | atleta de campo do NFL (atlas `football_hd`) | enviado pelo usuário: "Meshy_AI_Patriot_Sentinel" |
| `hockey_player.glb`   | patinador do NHL (atlas `hockey_hd`)        | enviado pelo usuário: "Meshy_AI_Oilers_Captain" |

* Os `.glb` originais são malhas estáticas, **sem cor, textura, UV ou esqueleto** (50–70 mil triângulos). `tools/blender/athlete_import.py` as normaliza (1,80 m, virado para +X),
  reduz para ~12 mil triângulos, monta o esqueleto do jogo, calcula os pesos de pele e pinta as zonas (camisa, calça, capacete, meias, faixas) para o sistema de cores de time.
* Para regenerar os atlas: `python3 tools/blender/make_atlas.py football_hd hockey_hd` (ver `docs/anim/BLENDER_NOTES.md`; ~3 min com `bpy` 5.1).
* **Licença / direitos:** confirme no painel da Meshy se o seu plano permite uso comercial e se exige atribuição (o plano gratuito costuma exigir crédito). Os nomes "Patriot" e "Oilers"
  só aparecem no nome do arquivo de origem; o jogo usa os modelos como atletas genéricos, pintados com as cores de cada time.
* Desligar no jogo: menu do alto-falante → "Sprites HD (NFL e NHL)" (volta aos atletas low-poly).
