import type { AtlasText } from "./types";

export const OPS_ES: Record<string, AtlasText> = {
  "nvidia-smi": {
    title: "nvidia-smi",
    summary: "La primera herramienta a la que recurres: utilización, memoria, temperatura, potencia, relojes, procesos y configuración por GPU.",
    body: `\`nvidia-smi\` habla con el driver a través de NVML. La tabla predeterminada muestra para cada GPU la temperatura, el consumo frente al límite, el uso de memoria, la utilización y los procesos que la usan.

**Las vistas que responden preguntas reales**
\`\`\`
nvidia-smi                                   # resumen + procesos
nvidia-smi -q -d PERFORMANCE                 # ¿por qué están bajos los relojes? (event reasons)
nvidia-smi -q -d TEMPERATURE,POWER,ECC       # temperatura, límites de potencia, errores de memoria
nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm,power.draw --format=csv
nvidia-smi topo -m                           # matriz de topología NVLink/PCIe/NIC
nvidia-smi nvlink -s                         # estado de cada enlace NVLink
sudo nvidia-smi -pl 500                      # fijar un límite de potencia
\`\`\`

**Advertencia**: "GPU-Util" significa que *había un kernel corriendo* durante la ventana de muestreo. No significa que la GPU estuviera ocupada. Una GPU esperando en una barrera a un [[stragglers|straggler]] sigue girando. Para métricas reales de saturación usa los campos de profiling de [[dcgm]], como actividad de SM y de tensor pipes.`,
  },
  dcgm: {
    title: "DCGM",
    summary: "Data Center GPU Manager: telemetría de GPU a escala de flota, chequeos de salud, diagnósticos y políticas, la base del monitoreo de GPUs.",
    body: `DCGM ejecuta un host engine (\`nv-hostengine\`) en cada nodo y expone:

- **Campos de telemetría**: temperatura, potencia, relojes, ECC, contadores NVLink, eventos Xid y métricas de *profiling* (\`SM_ACTIVE\`, \`SM_OCCUPANCY\`, \`PIPE_TENSOR_ACTIVE\`, \`DRAM_ACTIVE\`).
- **Health watches** que señalan problemas térmicos, de potencia, memoria, PCIe y NVLink.
- **Diagnósticos**: \`dcgmi diag -r 1|2|3\`, desde chequeos rápidos de despliegue hasta pruebas de estrés. Corre el nivel 1 antes de que un nodo vuelva al pool y el nivel 3 después de trabajo de hardware.
- **dcgm-exporter** para Prometheus, que alimenta paneles de Grafana y reglas de alerta.

**Alertas que conviene tener desde el primer día**
- Cualquier evento [[xid-errors|Xid]] (los críticos despiertan a alguien).
- HW thermal slowdown activo durante más de un minuto.
- [[ecc-errors|ECC]] no corregible o row remap pendiente.
- GPU ocupada mientras el planificador no muestra *ningún trabajo* en ese nodo. Eso atrapa fugas *y* [[cryptojacking]].`,
  },
  "xid-errors": {
    title: "Errores Xid",
    summary: "Códigos de error que el driver del kernel de NVIDIA escribe en el log del sistema cuando algo sale mal en una GPU.",
    body: `Un Xid es la forma del driver de decir "esta GPU tuvo un problema". Aparece en el log del kernel (\`dmesg\`, \`journalctl -k\`) como \`NVRM: Xid (PCI:0000:xx:00.0): <código>, ...\`. Los mensajes los emite el driver del kernel, que puedes leer en *open-gpu-kernel-modules* de NVIDIA.

**Códigos que todo operador de GPUs debería reconocer**
| Xid | Significado | Acción típica |
|---|---|---|
| 13, 31, 43 | Errores de la aplicación (acceso inválido a memoria, instrucción ilegal) | Normalmente el código del usuario |
| 48 | Error ECC no corregible (doble bit) | Reset de la GPU, revisar row remapping, vigilar si se repite |
| 63, 64 | Eventos de row remapping | Reset cuando esté libre; RMA si el remapeo falla |
| 74 | Error de NVLink | Revisar enlaces, reasentar, correr nccl-tests |
| 79 | La GPU se cayó del bus | Drain del nodo, reinicio, probablemente ticket de hardware |
| 94, 95 | Error ECC contenido / no contenido | Contenido: solo afecta a la app. No contenido: reset |

**Patrón de operación**: alerta de Xid vía [[dcgm]], **drain** del nodo en [[slurm]] con el Xid en el motivo, requeue de los trabajos afectados desde sus [[checkpointing|checkpoints]] y luego diagnóstico fuera de línea.`,
  },
  "ecc-errors": {
    title: "Errores ECC y row remapping",
    summary: "La HBM está protegida por códigos de corrección de errores: los errores de un bit se corrigen en silencio y los de dos bits detienen el trabajo.",
    body: `Las GPUs de centro de datos protegen la HBM (y la SRAM del chip) con ECC:

- **Un bit (corregible)**: se corrige al vuelo y se cuenta. Un conteo que crece despacio es normal. Uno que crece rápido es una advertencia.
- **Doble bit (no corregible, DBE)**: el dato se pierde. La aplicación recibe un error ([[xid-errors|Xid 48]] / 94 / 95) y la GPU normalmente necesita un **reset**.

A100 y posteriores usan **row remapping**: una fila de DRAM mala se reemplaza por una de repuesto en el siguiente reset de la GPU. \`nvidia-smi -q -d ECC\` muestra "Remapped Rows → Pending: Yes" hasta que hagas el reset. Si el remapeo *falla* (se agotaron los repuestos), hay que reemplazar la GPU.

**Procedimiento**: drain → esperar a que salgan los trabajos → \`nvidia-smi -r -i <gpu>\` → \`dcgmi diag -r 2\` → volver a servicio si sale limpia.`,
  },
  stragglers: {
    title: "Stragglers (rezagados)",
    summary: "En el entrenamiento síncrono todo el trabajo corre a la velocidad de su GPU más lenta. Encontrar esa GPU es una habilidad clave de operación.",
    body: `Cada colectiva es una barrera. Si una de 1,024 GPUs va 40% más lenta (por throttling térmico, un enlace inestable, un vecino ruidoso o un disco lento en un nodo), **las 1,024** van 40% más lentas.

**Señales**
- El rendimiento cae sin errores en los logs.
- La utilización por GPU parece *invertida*: el straggler muestra ~100% y las demás menos, porque esperan en la barrera.
- El reloj de SM del straggler está bajo. \`nvidia-smi -q -d PERFORMANCE\` muestra *HW Thermal Slowdown* o *SW Power Cap*.
- Los tiempos de NCCL o del framework muestran un rango que siempre llega tarde a las colectivas.

**Respuesta**: identificar, hacer drain, reiniciar desde un [[checkpointing|checkpoint]] en hardware sano y abrir un ticket de hardware. A escala, automatízalo: tiempos por rango continuos, relojes y temperaturas de [[dcgm]] y aislamiento automático.`,
  },
  checkpointing: {
    title: "Checkpointing y tolerancia a fallas",
    summary: "Guarda periódicamente el estado del modelo y del optimizador para que una falla cueste minutos de progreso, no días.",
    body: `Con miles de GPUs, *algo* falla cada pocas horas. El **checkpointing** limita el daño: ante una falla, reinicias desde el último estado guardado y pierdes como máximo un intervalo.

**Cómo elegir el intervalo**: muy frecuente desperdicia tiempo de E/S; muy espaciado desperdicia cómputo cuando hay fallas. Una aproximación clásica (Young/Daly) es *intervalo ≈ √(2 × costo_del_checkpoint × MTBF)*.

**Cómo abaratarlo**
- Checkpoints repartidos: cada rango escribe su parte en paralelo.
- Checkpointing asíncrono: copia a la memoria del host y escribe en segundo plano.
- Guarda varios checkpoints recientes. Los guardados corruptos o parciales ocurren.

**Integración con la operación**: \`scontrol requeue\` o un bucle de reintento del trabajo, más un **pool de repuestos encendidos**, convierten "se murió una GPU" en una pausa de 5 minutos. Ese es el ciclo que practicas en *Fallen Off the Bus* y *The Slow Lane*.`,
  },
  "multi-tenancy": {
    title: "Multi-tenencia y GPUs compartidas",
    summary: "Time-slicing, MPS y MIG: tres formas de compartir una GPU, con garantías de aislamiento muy distintas.",
    body: `Los clústeres compartidos deben decidir cómo comparten las GPUs los distintos inquilinos:

| Enfoque | Aislamiento | Bueno para |
|---|---|---|
| Asignación de GPU completa (forzada por el planificador) | Fuerte | Entrenamiento, cualquier cosa seria |
| Instancias [[mig\\|MIG]] | Fuerte (memoria y SM particionados por hardware) | Inferencia, notebooks, CI |
| MPS (Multi-Process Service) | Débil: una falla en el espacio de direcciones compartido puede afectar a otros | Trabajos cooperativos de un mismo equipo |
| Time-slicing | Ninguno para la memoria; cambios de contexto | Solo desarrollo y pruebas |

**Hacer cumplir importa más que la política.** El planificador debe ser el *único* camino hacia una GPU: los controles de dispositivos de cgroups restringen \`/dev/nvidia*\` a procesos dentro de una asignación. Sin eso, cualquier usuario con shell en un nodo puede usar en silencio las GPUs libres. Ver [[cryptojacking]].

Combínalo con cuentas de mínimo privilegio, sin usuarios de servicio compartidos, logs de auditoría y contabilidad por inquilino para que el uso sea visible y justo (ver [[fair-share]]).`,
  },
  cryptojacking: {
    title: "Cryptojacking en clústeres de GPU",
    summary: "Minería de criptomonedas no autorizada con tiempo de GPU robado: la forma más común de abuso de clústeres de GPU.",
    body: `Las GPUs son valiosas, y los atacantes que logran ejecutar código en un nodo de GPU muy a menudo simplemente **minan criptomonedas**. Puertas de entrada comunes:

- Servicios expuestos sin autenticación: notebooks, paneles e interfaces de herramientas de ML en \`0.0.0.0\` (ver [[exposed-notebooks|notebooks expuestos]]).
- Credenciales y claves de API filtradas en imágenes, repositorios o scripts de trabajos (ver [[supply-chain-and-secrets|cadena de suministro y secretos]]).
- Contenedores con demasiados privilegios.

**Señales de detección**
- Una GPU ocupada **sin ningún trabajo planificado**: compara la utilización de [[dcgm]] con el estado del planificador.
- Nombres de procesos desconocidos en las GPUs (\`nvidia-smi\`), a menudo disfrazados de hilos del kernel.
- Conexiones salientes a pools de minería (protocolo stratum, puertos como 3333/4444) en \`ss -tnp\` o en los logs del firewall.
- Entradas nuevas de cron o unidades de systemd de usuarios inesperados.

**Respuesta**: preservar evidencia → matar el proceso → eliminar la persistencia → cerrar la puerta de entrada → bloquear o rotar las identidades afectadas → buscar movimiento lateral → reportar. Matar el proceso nunca es suficiente. La misión *Night Shift* lo hace concreto.`,
  },
  "exposed-notebooks": {
    title: "Notebooks y paneles expuestos",
    summary: "Un servidor Jupyter sin token en 0.0.0.0 es ejecución remota de código para cualquiera que pueda alcanzarlo.",
    body: `Jupyter está diseñado para ejecutar código arbitrario: esa es la idea. Con \`--ip=0.0.0.0\` y la autenticación desactivada (token y contraseña vacíos), cualquiera que alcance el puerto puede ejecutar comandos como el usuario del notebook. Lo mismo aplica a muchos paneles de ML, trackers de experimentos e interfaces de inferencia.

**Patrones más seguros**
- Escucha en \`127.0.0.1\` y accede con un **túnel SSH** o un gateway autenticado (JupyterHub con SSO).
- Nunca desactives tokens ni contraseñas. Usa TLS cuando el tráfico salga del host.
- Pon firewall a los nodos de cómputo: solo las redes del planificador, de monitoreo y de administración deberían alcanzarlos.
- Ejecuta los notebooks *dentro* de asignaciones del planificador, para que tengan límite de tiempo y queden contabilizados.

**Cómo detectarlo**: \`ss -tlnp\` muestra listeners en \`0.0.0.0\`. Los logs del servidor registran solicitudes desde IP inesperadas. El monitoreo de red señala conexiones entrantes a nodos de cómputo desde afuera.`,
  },
  "supply-chain-and-secrets": {
    title: "Cadena de suministro y secretos",
    summary: "Imágenes de contenedor, pesos de modelos y scripts de trabajos son código que ejecutas, y un lugar común para credenciales filtradas.",
    body: `Un trabajo de entrenamiento incorpora mucho código ajeno: imágenes base, paquetes de Python, kernels personalizados, pesos preentrenados y datasets. Cada uno es parte de tu cadena de suministro.

**Riesgos**
- Imágenes con **secretos incrustados** (claves de nube, tokens) que puede leer cualquiera que las descargue.
- **Archivos de modelo basados en pickle** que pueden ejecutar código al cargarse. Prefiere \`safetensors\`.
- Dependencias sin fijar que cambian sin que te enteres.

**Controles**
- Fija las imágenes por digest, escanéalas y constrúyelas desde bases confiables.
- Inyecta los secretos en tiempo de ejecución desde un gestor de secretos, acotados por trabajo. Nunca en scripts \`#SBATCH\`, archivos env en repositorios ni capas de imagen.
- Credenciales de corta duración y mínimo privilegio para el acceso al almacenamiento.
- Verifica checksums o firmas de pesos y datasets.

Estos controles protegen *tu* clúster y también a las personas cuyos datos y modelos están a tu cargo.`,
  },
  "energy-and-carbon": {
    title: "Energía y carbono",
    summary: "kWh, PUE y CO₂e: medir el costo ambiental del cómputo para poder gestionarlo en lugar de adivinarlo.",
    body: `Un clúster de GPUs es cliente de una central eléctrica. Una contabilidad aproximada:

\`\`\`
energía de la instalación (kWh) = energía de TI (GPUs + hosts + red) × PUE
emisiones (kg CO₂e)             = energía de la instalación × intensidad de carbono de la red
\`\`\`

- El **PUE** (Power Usage Effectiveness) captura el costo extra de refrigeración y distribución eléctrica: ~1.1 en los mejores sitios con refrigeración líquida, 1.3–1.6 en los típicos.
- La **intensidad de carbono** varía más de 10× entre regiones y según la hora del día. Dónde y cuándo entrenas puede importar tanto como cómo.

**Palancas que controlas**
- Primero la eficiencia: mayor [[mfu|MFU]] significa menos horas de GPU para el mismo modelo.
- Los [[power-capping|límites de potencia]] cambian un poco de velocidad por mucha energía.
- Ajusta el tamaño: no dejes asignaciones ociosas corriendo. Los planificadores pueden recuperarlas.
- Reporta kWh y CO₂e por ejecución, junto al costo y la precisión, para que los compromisos sean visibles.

Cada ejecución de LazyLab muestra su energía, costo y carbono en el encabezado.`,
  },
  "power-capping": {
    title: "Limitación de potencia",
    summary: "Baja el límite de potencia de una GPU y cede un poco de velocidad por mucha menos energía: a menudo 20% menos potencia por menos de 10% de lentitud.",
    body: `Cerca del extremo superior de la curva voltaje/frecuencia, la potencia crece mucho más rápido que el rendimiento: la potencia dinámica ∝ *f·V²*, y el voltaje debe subir con la frecuencia. Por eso limitar la potencia cuesta proporcionalmente *menos* rendimiento del que ahorra.

En el entrenamiento, solo la parte limitada por cómputo de cada paso se frena. La comunicación, la carga de datos y las burbujas de pipeline no dependen de los relojes del SM, así que el impacto real en el rendimiento es aún menor.

**Cómo**
\`\`\`
sudo nvidia-smi -pl 550            # todas las GPUs de este nodo
sudo nvidia-smi -pl 550 -i 3       # solo la GPU 3
\`\`\`
Los límites se pierden al reiniciar salvo que los gestione tu aprovisionamiento o las políticas de [[dcgm]].

**Advertencias**: limita *todas* las GPUs de un trabajo. Limitar una crea un [[stragglers|straggler]]. Y mide tokens por joule, no solo tokens por segundo.`,
  },
  "fair-share": {
    title: "Planificación fair-share",
    summary: "Políticas del planificador que equilibran el acceso entre equipos según lo que les corresponde y lo que usaron recientemente.",
    body: `En un clúster compartido, "el primero que llega se sirve primero" permite que los 1,000 trabajos encolados de un equipo dejen sin recursos a todos los demás. La planificación **fair-share** (p. ej. la prioridad multifactor de Slurm) baja la prioridad de usuarios y cuentas que usaron recientemente más de lo que les toca, y ese uso decae con el tiempo.

**Los ingredientes**
- **Shares**: lo que le corresponde a cada cuenta, a menudo según financiamiento o tamaño del equipo.
- **Decaimiento del uso**: una vida media (p. ej. 7 días) para que el uso pasado se perdone gradualmente.
- **Límites de QOS**: topes de GPUs concurrentes, tiempo de pared o número de trabajos, para que ningún trabajo bloquee el clúster.
- **Preemption**: los trabajos de baja prioridad u oportunistas pueden guardar checkpoint y volver a la cola cuando llega trabajo prioritario. Solo funciona si los trabajos hacen [[checkpointing]] bien.

La equidad también es *transparencia*: publica el uso por equipo, los tiempos de espera en cola y la energía, para que las discusiones de asignación usen datos en lugar de anécdotas.`,
  },
};
