# Last Refuge

Juego de supervivencia zombi en vista cenital, hecho en **HTML5 + JavaScript** (sin librerías ni instalaciones).
Se juega en el navegador, **en PC y en celular** (controles táctiles), solo u **online con amigos** (hasta 6, por código de sala).

## Qué tiene
- Mundo procedural con semilla: ciudad con casas, mansiones, gasolinera, supermercado, comisaría, ferretería y hospital; lagos y bosques.
- Día y noche: de noche casi no se ve y aparecen muchos más zombis (nunca bajo una luz).
- Zombis normales, corredores (gritan), lanzadores (tiran rocas), brutos y rompemuros (derriban paredes). Rompen puertas.
- Armas cuerpo a cuerpo (cuchillo, sartén, bate, hacha) y de fuego (pistola, subfusil, escopeta, rifle) con munición y recarga.
- Explosivos: granada, cóctel molotov, dinamita y petardos.
- Mochilas que se equipan en la ranura de espalda (hasta 50 kg).
- Muebles con inventario, cofres propios, botín que se repone cada día.
- Construir y destruir (paredes, puertas, ventanas, suelo, cofres) con tablones.
- Autos con gasolina, choques y atropellos.
- Antorchas e interruptores de luz en las casas: con luz no aparecen zombis.
- Hambre, sed, aguante, sangrado, infección, pesca, linterna con pilas.
- Guardado automático en el navegador (y botón «Guardar partida»).

## Controles
**Celular:** dedo izquierdo = moverse (hasta el borde = correr). Dedo derecho = apuntar y atacar (con armas de fuego dispara al empujar).
Botón amarillo = interactuar. Botones a la derecha: recargar, lanzar, empujar, arma, luz, furtivo, correr, comer, venda, construir y destruir.

**PC:** WASD moverse · Shift correr · C furtivo · ratón apuntar · clic izq. atacar · clic der. apuntar arma de fuego · E interactuar ·
Espacio empujar · R recargar · F linterna · Tab arma · H venda · Q comer · V lanzar · B construir (1-5) · G destruir · I inventario · M mapa · T chat · Esc menú.

## Publicarlo en GitHub Pages
1. Crea un repositorio nuevo (por ejemplo `last-refuge`) y sube todos estos archivos a la raíz.
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save**.
3. En 1-2 minutos el juego queda en `https://TU-USUARIO.github.io/last-refuge/`.

En el celular puedes usar «Agregar a la pantalla de inicio» para abrirlo como una app a pantalla completa.

## Archivos
- `index.html`, `style.css` — página y estilos.
- `js/data.js` — objetos, armas, zombis, botín y ajustes.
- `js/map.js` — generación del mapa. `js/art.js` — arte en píxeles generado por código.
- `js/game.js` — lógica del juego. `js/net.js` + `js/znet.js` — online (WebRTC).
- `js/ui.js` — menús, inventario y botones táctiles. `js/app.js` — bucle, dibujo, controles y HUD.
