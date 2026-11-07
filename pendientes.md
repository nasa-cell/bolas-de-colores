# Pendientes

## Ajuste automático (2026-11-05)

- [x] 1. Ajuste solo al abrir: pantalla completa y destellos de cuadritos; pone sola las 4 esquinas
- [x] 2. Separar Post-its pegados en fila (hasta 5)
- [x] 3. Luz automática: bolas y borde más grandes con mucha luz, más brillo de cámara con poca
- [x] 4. Ignorar a la persona que pasa delante y guardar los Post-its que tapa
- [x] 5. Pegas otro y lo capta (medio segundo quieto); lo quitas y se va
- [x] 6. Reajuste solo si se mueve la cámara, cambia la ventana o gira el celular
- [x] 7. Funciona con la cámara del celular (espera la imagen con retraso)
- [x] 8. Modo manual por si acaso (H → Calibración → «Ajuste automático» apagado) y botón «Ajustar ahora»
- [x] 9. Línea nueva en index.html y explicación en cambios/LEEME.md
- [x] 10. Pruebas: cámara simulada (webcam, celular con retraso, mucha luz) y cuadros del video del aula
- [x] 11. Los 9 colores a la vez, separados aunque estén pegados
- [ ] Probar en el aula con el proyector y el celular de verdad

## Enseñar un Post-it tocándolo (2026-11-05)

- [x] 12. Tocar el Post-it en la PC (H → Cromática, en el video) para enseñarlo
- [x] 13. Botones «Enseñar Post-it» y «Olvidar enseñados» en el celular
- [x] 14. Se recuerda al recargar; tocar otra vez ajusta el color a la luz de ahora
- [x] 15. Prueba: PC y celular por el servidor (celular derecho y de costado), sin errores
- [ ] Probar en el aula con Post-its de verdad que hoy no detecta

## Cámara que no ve la pantalla (2026-11-05)

- [x] 16. No se queda en «Ajustando…» (ahora con los botones del pendiente 20)
- [x] 17. Sin proyector: el recuadro sigue al Post-it en la mano, lo quita al sacarlo y no cuenta los dedos
- [x] Pruebas: cámara que mira la habitación (cara, ropa, madera) y la prueba vieja con proyector
- [ ] 15. Formas con los Post-its (canasta y otras): elegir en la maqueta
- [x] 18. Ajuste falso por reflejos: exige 8 de 12 cuadritos y forma de cuadrilátero
- [x] 20. Botones «Con proyector» / «Sin proyector» en la PC y botón «Modo» en el celular; se recuerda al recargar
- [ ] 19. Modelo que aprende «es Post-it / no es»: según cómo vaya la prueba
- [x] 21. «Con proyector»: solo 3 intentos y para; «Ajustar ahora», «Con proyector» o cambiar de cámara dan 3 nuevos
- [x] 22. Tras 3 intentos fallidos se apaga solo «Ajuste automático»; prenderlo (o «Con proyector» en el celular) da 3 intentos nuevos

## Simulación con fotos reales (2026-11-06)

Pruebas en `C:\herramientas\pw\pruebas-posits` (simulacion.js = fotos del usuario, simulacion-nueva.js = grupo A inventado,
simulacion-final.js = grupo B nunca visto). Videos: simulacion-antes.mp4 y video-prueba-final.mp4.

- [x] Simulación en vivo con las 2 fotos, grabada
- [x] 24. Brillo automático: sube hasta que lo más claro quede en 225 (máx. ×2,2); antes quemaba los Post-its
- [x] 26. Amarillo dorado partido entre dos colores: se juntan celdas con tono a menos de 10°
- [x] Post-it grande con la cámara cerca (más de 5 %): se acepta si hay 2 más de tamaño parecido (una cara sola no)
- [x] Sin proyector no se tapan las zonas de las bolas
- [x] 27. Medida «tapa justo %»: 80–97 % en las escenas buenas
- [x] Pruebas viejas: dan igual que antes (las fallas de «sin proyector automático» y «código de sala» ya fallaban antes)
- [x] 23. Grupo B nunca visto: 6 de 10 perfectas (antes de los arreglos el grupo A daba 3 de 10)
- [ ] 25. Falsos con papel tapiz a rayas + luz cálida (10 falsos) y 1 falso en «escritorio con sombra»
- [ ] Post-its quemados a blanco por exceso de luz: límite de la cámara (sin color no se pueden ver)
- [x] 28. La app se prueba sola (opción A, solo con «Ajuste automático»): borde blanco en 2 destellos, hasta 3 intentos, aviso blanco si no logra; recuerda la corrección si el Post-it se pierde un momento. Prueba: recuadros corridos 8 % quedan en 1–2 % (PC y celular 350 ms, 3 de 3 corridas)
- [x] 29. Equalizer APO 1.4.2 instalado en los parlantes (Realtek Speaker), +5 dB en C:/Program Files/EqualizerAPO/config/config.txt (original en config-original.txt)
- [ ] Subir a GitHub/Render solo si el usuario lo autoriza

## A transparencia (2026-11-07)

- [x] 30. Tecla A y botón ☰ A: menú que se abre como H
- [x] 31. Mide la luz sola, sin destellos, y dice «Listo, luz medida»
- [x] 32. Imagen en vivo gris y transparente: se señala cada Post-it y la imagen se mueve sola hasta calzar
- [x] 33. Mide cada Post-it solo; «¿Está correcto?»: se corrige con un marco, la imagen o sus esquinas
- [x] 34. Sugiere de 6 a 8 lugares nuevos con buena luz; si hay menos, lo avisa
- [x] 35. Si se mueve la cámara, se reajusta con los Post-its señalados, sin destellos; si ve menos de 3, pide A
- [x] 36. Se quitó: destellos, 3 intentos, «Se prueba sola», «Ajuste automático», «Ajustar ahora», 4 esquinas de antes, «Superponer Cámara», «Enseñar Post-it» (PC y celular)
- [x] 37. Todo dentro de cambios; index.html sin tocar
- [x] Pruebas con cámara simulada: `C:\herramientas\pw\pruebas-posits\prueba-a-transparencia.js` y `prueba-a-otros.js`
- [x] 38. Botón y tecla X: al cerrar A se ocultan las sugerencias; X muestra sugerencias + cámara transparente (sin barra de color ni pantalla de cámara dentro de A, descartadas)
- [x] 39. Mini cámara en el menú A: 4 números para arrastrar y tocar Post-its para medirlos; señalar en la pared queda para afinar. Prueba: `prueba-a-mini.js`
- [x] 40. Más fluido al pegar Post-its: fotos livianas del celular con la imagen a la vista, Post-it nuevo a los 250 ms, imagen redibujada cada 30 ms
- [x] 43. Tocar Post-its en la mini cámara: la imagen crece sola (aproximada); toque en la pared o números mandan
- [x] 44. Fotos en camino según la red medida: más fotos con buena red, sin acumular retraso con subida lenta
- [x] 42. Cámara del celular fluida: varias fotos en camino en vez de esperar cada respuesta
- [x] 41. Imagen grande y mini cámara a color; transparencia mínima 55 % (por debajo de 45 % salen falsos en la simulación)
- [ ] Probar en el aula con proyector, celular y Post-its de verdad
- [ ] README.md de la raíz aún describe el ajuste de antes (filas «Ajuste automático», «Con proyector / Sin proyector» y «Enseñar un Post-it»): corregir antes de subir
- [ ] Subir a GitHub/Render solo si el usuario lo autoriza
