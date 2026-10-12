import type { Question } from "../levels";

// Same questions, options and answer indices as the English CHALLENGES (tests enforce this).
export const CHALLENGES_ES: Record<string, Question[]> = {
  gpu: [
    { kind: "choice", prompt: "¿Cómo oculta principalmente una GPU la latencia de memoria?", options: ["Con grandes predictores de saltos", "Manteniendo miles de hilos en vuelo y cambiando entre ellos", "Con una caché L3 mayor que la de las CPU", "Con relojes mucho más rápidos"], answer: 1, explain: "Las GPUs cambian velocidad por hilo por paralelismo: mientras un warp espera a la memoria, el planificador emite otro." },
    { kind: "choice", prompt: "¿Aproximadamente cuánto más lento es PCIe Gen5 (~64 GB/s) que la HBM de una H100 (~3,350 GB/s)?", options: ["Más o menos igual", "~2×", "~50×", "~10,000×"], answer: 2, explain: "3350 ÷ 64 ≈ 52. Por eso los datos deben quedarse en el dispositivo en lugar de ir y venir por PCIe." },
  ],
  "streaming-multiprocessor": [
    { kind: "choice", prompt: "nvidia-smi reporta 100% de GPU-Util. ¿Qué garantiza eso realmente?", options: ["Que todos los SM están ocupados", "Que había un kernel corriendo durante la ventana de muestreo", "Que los tensor cores están saturados", "Que el ancho de banda de memoria está al máximo"], answer: 1, explain: "GPU-Util solo significa que algún kernel estaba activo. Usa las métricas SM_ACTIVE / tensor pipe de DCGM para medir la saturación real." },
    { kind: "number", prompt: "Una H100 está limitada térmicamente al 55% de su reloj máximo de SM. ¿Aproximadamente qué porcentaje de sus FLOP/s máximos puede entregar?", answer: 55, tolerance: 5, unit: "%", explain: "FLOP/s máximos = SM × FLOPs/ciclo × reloj, así que el rendimiento escala con el reloj: ~55%." },
  ],
  hbm: [
    { kind: "number", prompt: "Adam en precisión mixta necesita ~16 bytes por parámetro. ¿Cuántos GB de estado necesita un modelo de 7 mil millones de parámetros, sin contar activaciones?", answer: 112, tolerance: 8, unit: "GB", explain: "7e9 × 16 B = 112 GB, más de lo que cabe en una GPU de 80 GB. Por eso se reparte (ZeRO) o se divide (TP/PP)." },
    { kind: "choice", prompt: "Un kernel hace una suma por cada 8 bytes que lee de memoria. ¿Qué limita su velocidad en una H100?", options: ["El rendimiento de los tensor cores", "El ancho de banda de HBM", "El ancho de banda de PCIe", "La cantidad de registros"], answer: 1, explain: "Intensidad aritmética ≈ 0.125 FLOP/byte, muy por debajo del punto de inflexión (~295). Está limitado por memoria." },
  ],
  pcie: [
    { kind: "choice", prompt: "`nvidia-smi topo -m` muestra `SYS` entre cada par de GPUs (sin NVLink). ¿Qué paralelismo sufre más?", options: ["Paralelismo de datos con acumulación de gradientes", "Paralelismo tensorial", "Inferencia independiente en cada GPU", "Carga de datos"], answer: 1, explain: "El paralelismo tensorial necesita varios all-reduce por capa. Por PCIe pasando por la CPU, eso se vuelve el cuello de botella." },
    { kind: "choice", prompt: "Xid 79 dice que la GPU \"se cayó del bus\". ¿De qué bus?", options: ["NVLink", "PCIe", "InfiniBand", "El bus de memoria HBM"], answer: 1, explain: "El driver ya no puede llegar a la GPU por PCIe. Como mínimo hay que reiniciar, y a menudo abrir un ticket de hardware." },
  ],
  nvlink: [
    { kind: "choice", prompt: "¿Qué paralelismo debería vivir dentro del dominio NVLink?", options: ["Paralelismo de datos", "Paralelismo tensorial", "Paralelismo de pipeline", "Ninguno"], answer: 1, explain: "Pon el tráfico más conversador en el enlace más rápido: TP hace all-reduce de activaciones en cada capa." },
    { kind: "choice", prompt: "Con esta salida, ¿qué Xid esperarías en `dmesg`?", code: "$ nvidia-smi nvlink -s -i 2\nGPU 2: NVIDIA H100 80GB HBM3\n\t Link 3: 26.562 GB/s\n\t Link 4: <inactive>\n\t Link 5: 26.562 GB/s", options: ["Xid 79", "Xid 74", "Xid 48", "Xid 13"], answer: 1, explain: "Xid 74 es un error de NVLink. El tráfico pasa en silencio a PCIe y las colectivas se frenan." },
  ],
  nvswitch: [
    { kind: "choice", prompt: "¿Qué agrega NVSwitch sobre NVLink punto a punto?", options: ["Cifrado", "Conectividad todos con todos a pleno ancho de banda entre GPUs", "HBM más rápida", "Enlaces a otros servidores por InfiniBand"], answer: 1, explain: "Sin switch, cada GPU solo se enlaza con unas pocas vecinas. NVSwitch construye un crossbar sin bloqueo." },
    { kind: "choice", prompt: "`nvidia-smi topo -m` muestra `NV18` entre cada par de GPUs. ¿Qué significa 18?", options: ["18 GB/s", "18 enlaces NVLink agrupados", "18 saltos", "NVLink versión 18"], answer: 1, explain: "NV# es el número de enlaces NVLink agrupados: 18 en una H100 SXM, unos 900 GB/s bidireccionales." },
  ],
  infiniband: [
    { kind: "choice", prompt: "Ves esto en el log de un trabajo multinodo. ¿Qué está pasando?", code: "NCCL INFO NET/Socket : Using [0]eth0:10.0.1.12<0>\nNCCL INFO NCCL_IB_DISABLE set by environment to 1.", options: ["Todo bien: se usa RDMA", "NCCL recurrió a sockets TCP, así que espera una gran ralentización", "NVLink está caído", "El trabajo se quedó sin memoria"], answer: 1, explain: "NET/Socket significa TCP. Quita NCCL_IB_DISABLE=1 para obtener NET/IB (RDMA)." },
    { kind: "choice", prompt: "En un servidor H100 rail-optimized, ¿aproximadamente cuánto ancho de banda de escalado tiene cada GPU?", options: ["~1 GB/s", "~50 GB/s (una NIC de 400 Gb/s por GPU)", "~450 GB/s", "~3 TB/s"], answer: 1, explain: "400 Gb/s ÷ 8 bits = 50 GB/s por GPU, cerca de un noveno de NVLink." },
  ],
  "cluster-topology": [
    { kind: "choice", prompt: "¿Por qué la sobresuscripción de red (p. ej. 2:1) perjudica más al entrenamiento que al tráfico web?", options: ["El entrenamiento usa UDP", "Durante el all-reduce todas las GPUs transmiten al mismo tiempo", "El entrenamiento necesita más almacenamiento", "No lo perjudica"], answer: 1, explain: "Las colectivas son ráfagas sincronizadas. Todos necesitan el ancho de banda completo en el mismo momento." },
    { kind: "choice", prompt: "Ordena la jerarquía de ancho de banda, de la más rápida a la más lenta:", options: ["HBM > NVLink > InfiniBand > almacenamiento", "NVLink > HBM > almacenamiento > InfiniBand", "InfiniBand > NVLink > HBM > almacenamiento", "almacenamiento > HBM > NVLink > InfiniBand"], answer: 0, explain: "~3.35 TB/s de HBM, ~450 GB/s de NVLink, ~50 GB/s por GPU de InfiniBand y luego el almacenamiento. Ubica el paralelismo sobre esa escala." },
  ],
  "cuda-stack": [
    { kind: "choice", prompt: "Un contenedor trae el runtime CUDA 12.4, pero el driver del host solo soporta hasta CUDA 12.2. ¿Qué pasa?", options: ["Funciona bien: los runtimes nuevos siempre corren en drivers viejos", "Probablemente falle: el driver debe soportar la versión de CUDA del runtime (salvo con paquetes de forward-compat)", "El contenedor instala su propio driver de kernel", "Solo baja el rendimiento"], answer: 1, explain: "Un driver más nuevo ejecuta runtimes más viejos, no al revés. nvidia-smi muestra la versión máxima de CUDA que soporta el driver." },
    { kind: "choice", prompt: "¿De dónde vienen los mensajes Xid?", options: ["De PyTorch", "Del driver del kernel de NVIDIA", "De Slurm", "De NCCL"], answer: 1, explain: "El módulo del kernel (open-gpu-kernel-modules) los escribe en el log del kernel: dmesg / journalctl -k." },
  ],
  slurm: [
    { kind: "choice", prompt: "Los nodos tienen 8 GPUs y el script pide `--gpus-per-node=16`. ¿Cuál es la causa más probable de este error?", code: "$ sbatch train.sh\nsbatch: error: Batch job submission failed: Requested node configuration is not available", options: ["El clúster está ocupado", "Pide más GPUs por nodo de las que tiene cualquier nodo", "Versión equivocada de Python", "Falta de memoria"], answer: 1, explain: "Slurm rechaza pedidos que ningún nodo puede cumplir. Pide 2 nodos × 8 GPUs." },
    { kind: "choice", prompt: "Sospechas del hardware de node-3. ¿Cuál es la forma educada de sacarlo de servicio?", options: ["Hacer scancel de todos sus trabajos", 'scontrol update NodeName=node-3 State=DRAIN Reason="gpu5 fan"', "Reiniciarlo de inmediato", "Borrarlo de slurm.conf"], answer: 1, explain: "Drain deja terminar los trabajos en curso, evita los nuevos y registra el motivo en `sinfo -R`." },
  ],
  nccl: [
    { kind: "choice", prompt: "¿Qué variable de entorno hace que NCCL imprima el transporte que eligió?", options: ["NCCL_IB_DISABLE=1", "NCCL_DEBUG=INFO", "CUDA_VISIBLE_DEVICES", "OMP_NUM_THREADS"], answer: 1, explain: "NCCL_DEBUG=INFO registra NET/IB vs NET/Socket, los canales y la topología. Léelo cuando un trabajo vaya lento." },
    { kind: "choice", prompt: "Un trabajo se cuelga y luego muere con un watchdog timeout de ProcessGroupNCCL. ¿Cuál es la causa más probable?", options: ["Learning rate demasiado alto", "Un rango dejó de responder (enlace caído, GPU perdida o un straggler)", "Disco lleno", "Tokenizador equivocado"], answer: 1, explain: "Las colectivas son barreras. Un rango faltante detiene a todos hasta que salta el watchdog." },
  ],
  checkpointing: [
    { kind: "number", prompt: "Young/Daly: intervalo ≈ √(2 × costo del checkpoint × MTBF). Un checkpoint tarda 2 minutos y el MTBF es de 4 horas. ¿Intervalo en minutos?", answer: 31, tolerance: 3, unit: "min", explain: "√(2 × 2 × 240) = √960 ≈ 31 minutos." },
    { kind: "choice", prompt: "Un trabajo vuelve a la cola tras la falla de un nodo. ¿Desde dónde continúa?", options: ["Desde el paso 0", "Desde el último checkpoint guardado", "Exactamente desde donde falló", "No puede continuar"], answer: 1, explain: "Se pierde el trabajo desde el último checkpoint. Por eso importa el intervalo." },
  ],
  "kubernetes-gpu": [
    { kind: "choice", prompt: "El entrenamiento distribuido en Kubernetes necesita gang scheduling. ¿Por qué?", options: ["Para ahorrar energía", "Todos los workers deben arrancar juntos o ninguno, porque los arranques parciales se bloquean", "Para cifrar la GPU", "Para usar MIG"], answer: 1, explain: "Kubernetes planifica pods de uno en uno. Complementos como Kueue o Volcano dan la colocación todo o nada." },
    { kind: "choice", prompt: "¿Qué componente anuncia `nvidia.com/gpu` al planificador de Kubernetes?", options: ["kube-proxy", "El device plugin de NVIDIA", "CoreDNS", "etcd"], answer: 1, explain: "El device plugin (normalmente instalado por el GPU Operator) expone las GPUs como recurso planificable." },
  ],
  "fair-share": [
    { kind: "choice", prompt: "El equipo A usó 3× su parte la semana pasada. Con planificación fair-share, sus trabajos nuevos…", options: ["se rechazan", "tienen menor prioridad hasta que el uso decae", "corren primero", "se interrumpen de inmediato"], answer: 1, explain: "La prioridad baja con el uso reciente y se recupera a medida que decae (p. ej. con una vida media de 7 días)." },
    { kind: "choice", prompt: "La preemption solo funciona bien si los trabajos…", options: ["usan MIG", "hacen checkpoint con frecuencia", "usan FP8", "corren en un solo nodo"], answer: 1, explain: "Un trabajo interrumpido se reinicia desde su último checkpoint. Checkpoints espaciados desperdician mucho trabajo." },
  ],
  "nvidia-smi": [
    { kind: "choice", prompt: "Esta GPU consume 437 W mientras sus vecinas consumen ~650 W en el mismo trabajo. ¿Qué comando muestra *por qué*?", code: "| N/A   85C    P0             437W / 700W |  70471MiB / 81560MiB |   98%      Default |", options: ["nvidia-smi -L", "nvidia-smi -q -d PERFORMANCE", "nvidia-smi topo -m", "nvidia-smi -pl 700"], answer: 1, explain: "La sección PERFORMANCE lista las Clocks Event Reasons: límite de potencia, HW slowdown, thermal slowdown." },
    { kind: "choice", prompt: "¿Qué opción de nvidia-smi fija un límite de potencia de GPU?", options: ["-r", "-pl", "-L", "-q"], answer: 1, explain: "`sudo nvidia-smi -pl 550` (agrega `-i <gpu>` para una sola GPU). -r reinicia, -L lista, -q consulta." },
  ],
  "power-and-thermals": [
    { kind: "choice", prompt: "¿Cuál es la causa más probable?", code: "    Clocks Event Reasons\n        SW Power Cap                      : Not Active\n        HW Slowdown                       : Active\n            HW Thermal Slowdown           : Active", options: ["Alguien fijó un límite de potencia", "Sobrecalentamiento (ventilador fallido o flujo de aire bloqueado)", "La GPU está inactiva", "El driver es demasiado viejo"], answer: 1, explain: "HW Thermal Slowdown es el freno de emergencia por calor. Un límite de potencia aparecería como SW Power Cap." },
    { kind: "choice", prompt: "En entrenamiento síncrono, una GPU baja al 55% de su reloj. El rendimiento de todo el trabajo queda aproximadamente en…", options: ["~99%: las demás compensan", "~55–60% de lo normal", "Sin cambios", "Cero"], answer: 1, explain: "Cada colectiva espera a la GPU más lenta, así que todo el trabajo va al ritmo del straggler." },
  ],
  "xid-errors": [
    { kind: "choice", prompt: "Encuentras esto en dmesg de node-2. ¿Cuál es la primera respuesta correcta?", code: "NVRM: Xid (PCI:0000:9a:00.0): 79, pid='<unknown>', name=<unknown>, GPU has fallen off the bus.", options: ["Reiniciar el trabajo en el mismo nodo", "Hacer drain del nodo con el Xid en el motivo y volver a encolar el trabajo en otro lado", "Ignorarlo", "Bajar el learning rate"], answer: 1, explain: "Primero contener (drain), luego recuperar (requeue desde el checkpoint) y después diagnosticar el hardware fuera de línea." },
    { kind: "choice", prompt: "Los Xid 13, 31 y 43 suelen apuntar a…", options: ["Falla de hardware", "El código de la aplicación (acceso inválido a memoria, instrucción ilegal)", "Falla de red", "La fuente de alimentación"], answer: 1, explain: "Suelen ser fallas del código del usuario. Revisa el trabajo antes de culpar a la GPU." },
  ],
  "ecc-errors": [
    { kind: "choice", prompt: "`nvidia-smi -q -d ECC` muestra Remapped Rows → Pending: Yes. ¿Qué se necesita?", options: ["Nada", "Un reset de la GPU cuando esté libre", "Reemplazar la HBM de inmediato", "Reinstalar CUDA"], answer: 1, explain: "El row remapping se aplica en el siguiente reset: drain, esperar a los trabajos, `nvidia-smi -r -i <gpu>` y luego diagnósticos." },
    { kind: "choice", prompt: "Los errores ECC de un solo bit…", options: ["Son fatales para el trabajo", "Se corrigen al vuelo y se cuentan", "Solo ocurren en CPUs", "Los causa NCCL"], answer: 1, explain: "Un conteo que sube despacio es normal. Uno que sube rápido es una alerta temprana." },
  ],
  dcgm: [
    { kind: "choice", prompt: "¿Qué alerta atrapa tanto procesos huérfanos como mineros de criptomonedas?", options: ["Temperatura de GPU > 80°C", "GPU ocupada mientras el planificador no muestra ningún trabajo en ese nodo", "Uso de disco > 90%", "Velocidad baja del ventilador"], answer: 1, explain: "Compara la utilización de DCGM con el estado del planificador. Ocupada sin trabajo significa que corre algo que no debería." },
    { kind: "choice", prompt: "Un nodo vuelve de una reparación de hardware. Antes de reincorporarlo al pool, ejecuta…", options: ["Solo nvidia-smi -L", "dcgmi diag -r 3", "un ping", "Nada; ya está reparado"], answer: 1, explain: "Los diagnósticos de nivel 3 incluyen pruebas de estrés. El nivel 1 es el chequeo rápido de despliegue." },
  ],
  stragglers: [
    { kind: "choice", prompt: "¿Qué GPU es el straggler?", code: "index, utilization.gpu, clocks.sm\n0, 61 %, 1980 MHz\n1, 60 %, 1980 MHz\n5, 99 %, 1089 MHz\n6, 61 %, 1980 MHz", options: ["GPU 0", "GPU 5", "Ninguna", "Todas"], answer: 1, explain: "Reloj bajo con utilización alta: es la que todas las demás están esperando." },
    { kind: "choice", prompt: "¿Por qué las GPUs sanas muestran *menor* utilización durante un evento de straggler?", options: ["También están limitadas", "Terminan antes y esperan en la barrera a la GPU lenta", "Se cayeron", "Están cargando datos"], answer: 1, explain: "La utilización invertida (una al máximo, las demás más bajas) es la firma clásica de un straggler." },
  ],
  warp: [
    { kind: "number", prompt: "¿Cuántos hilos tiene un warp de NVIDIA?", answer: 32, tolerance: 0, explain: "32 hilos ejecutan al unísono (SIMT)." },
    { kind: "choice", prompt: "La mitad de los hilos de un warp toma la rama `if` y la otra mitad la `else`. ¿Qué pasa?", options: ["Ambas mitades corren en paralelo a toda velocidad", "El warp ejecuta ambos caminos con carriles enmascarados, tardando aproximadamente el doble", "Se cae", "El compilador elige una rama"], answer: 1, explain: "La divergencia de ramas serializa los caminos. Mantén el control de flujo uniforme dentro de un warp." },
  ],
  "memory-coalescing": [
    { kind: "number", prompt: "Los 32 hilos de un warp leen 32 floats consecutivos de 4 bytes. ¿Cuántas transacciones de memoria de 128 bytes se necesitan?", answer: 1, tolerance: 0, explain: "32 × 4 = 128 bytes, unidos en una sola transacción. Con un salto grande podrían ser 32." },
    { kind: "choice", prompt: "¿Qué organización de datos ayuda a la coalescencia cuando los kernels tocan un campo a la vez?", options: ["Arreglo de estructuras", "Estructura de arreglos", "Lista enlazada", "Tabla hash"], answer: 1, explain: "Con SoA, el hilo i lee el elemento i del mismo campo, así que las lecturas son contiguas." },
  ],
  occupancy: [
    { kind: "choice", prompt: "¿Qué limita cuántos warps pueden estar residentes en un SM?", options: ["Registros por hilo, memoria compartida por bloque e hilos/bloques por SM", "Espacio en disco", "Carriles PCIe", "Ancho de banda de red"], answer: 0, explain: "El banco de registros y la memoria compartida se reparten entre los warps residentes." },
    { kind: "choice", prompt: "¿La ocupación máxima es siempre lo más rápido?", options: ["Sí, siempre", "No: muchos kernels de primer nivel cambian ocupación por reutilización de datos en registros y memoria compartida"], answer: 1, explain: "Las GEMM y FlashAttention a menudo corren con ocupación baja. Mide, no supongas." },
  ],
  "tensor-core": [
    { kind: "number", prompt: "Una H100 hace ~989 TFLOP/s densos en BF16 con tensor cores frente a ~67 TFLOP/s en FP32 simple. ¿Aproximadamente cuántas veces más rápido?", answer: 15, tolerance: 1.5, unit: "×", explain: "989 ÷ 67 ≈ 14.8, por eso entrenar en FP32 simple deja ociosa la mayor parte de la GPU." },
    { kind: "choice", prompt: "¿Cuál de estas cosas perjudica la eficiencia de los tensor cores?", options: ["GEMM grandes", "Micro-batches diminutos y shards de paralelismo tensorial muy estrechos", "BF16", "Fusión de kernels"], answer: 1, explain: "Las matrices pequeñas no llenan los bloques ni los pipelines de los tensor cores." },
  ],
  "mixed-precision": [
    { kind: "choice", prompt: "¿Por qué BF16 rara vez necesita loss scaling y FP16 sí?", options: ["BF16 tiene más bits de mantisa", "BF16 conserva el rango de exponente de FP32", "BF16 es más lento", "FP16 no se soporta en H100"], answer: 1, explain: "El exponente de 8 bits de BF16 iguala el rango de FP32, así que los gradientes pequeños no se vuelven cero." },
    { kind: "choice", prompt: "En el entrenamiento en precisión mixta, ¿qué se guarda en FP32?", options: ["Las activaciones", "Los pesos maestros (más los momentos de Adam) para la actualización del optimizador", "Solo los gradientes", "Nada"], answer: 1, explain: "2 B de pesos + 2 B de gradientes + 12 B de estado del optimizador en FP32 dan la regla de 16 bytes/parámetro." },
  ],
  "data-parallelism": [
    { kind: "choice", prompt: "Con all-reduce en anillo, ¿qué pasa con el tráfico de gradientes por GPU al agregar GPUs?", options: ["Crece linealmente", "Se mantiene casi constante (~2× el tamaño del gradiente)", "Se reduce", "Crece cuadráticamente"], answer: 1, explain: "2(n−1)/n × S tiende a 2S. Por eso el paralelismo de datos escala tan bien." },
    { kind: "choice", prompt: "La acumulación de gradientes te permite…", options: ["usar menos cómputo", "agrandar el batch global sin más memoria y sincronizar menos por token", "saltarte el backward", "evitar el all-reduce por completo"], answer: 1, explain: "Varios micro-batches, una sola sincronización. Menos bytes en la red por token." },
  ],
  "cuda-streams": [
    { kind: "choice", prompt: "¿Qué hábito de PyTorch mata en silencio el solapamiento de cómputo y comunicación?", options: ["Usar torch.compile", "Llamar a .item() dentro del bucle de entrenamiento", "Usar memoria pinned", "Batches grandes"], answer: 1, explain: ".item() fuerza una sincronización del dispositivo, colapsando los streams asíncronos en ejecución serial." },
    { kind: "choice", prompt: "¿Cómo ejecuta grCUDA kernels independientes en paralelo sin streams escritos a mano?", options: ["Asignas los streams manualmente", "Infiere las dependencias a partir de los datos que toca cada kernel", "Los ejecuta en la CPU", "Usa MIG"], answer: 1, explain: "Construye un grafo de dependencias a partir de los argumentos de los kernels y programa el trabajo independiente en streams separados." },
  ],
  "activation-checkpointing": [
    { kind: "number", prompt: "El checkpointing completo cuesta un forward extra: 8N en lugar de 6N FLOPs por token. ¿Cuánto cómputo extra, en %?", answer: 33, tolerance: 3, unit: "%", explain: "8 ÷ 6 = 1.33, es decir ~33% más de cómputo a cambio de mucha menos memoria de activaciones." },
    { kind: "choice", prompt: "Sobra memoria, el MFU es bajo y el checkpointing de activaciones está activado. ¿Qué deberías probar?", options: ["Desactivar el checkpointing", "Hacer checkpoint de todavía más capas", "Pasar a FP32", "Reducir los workers del dataloader"], answer: 0, explain: "Cuando las activaciones caben, la recomputación es puro costo." },
  ],
  "zero-fsdp": [
    { kind: "number", prompt: "ZeRO-1 con dp = 8 reparte solo los 12 B/parámetro del optimizador. ¿Estado por GPU en bytes por parámetro (2 de pesos + 2 de gradientes + 12/8)?", answer: 5.5, tolerance: 0.1, unit: "B/parámetro", explain: "2 + 2 + 1.5 = 5.5 bytes/parámetro, en lugar de 16." },
    { kind: "choice", prompt: "¿Por qué ZeRO-3 / FSDP puede ser lento entre nodos?", options: ["Desactiva el solapamiento", "Hace all-gather de los parámetros antes de cada forward y backward de cada micro-batch", "Obliga a usar FP32", "Requiere MIG"], answer: 1, explain: "Para 70B son ~140 GB movidos dos veces por micro-batch. Bien por NVLink, doloroso por una NIC de 400G." },
  ],
  "tensor-parallelism": [
    { kind: "choice", prompt: "¿Por qué mantener el paralelismo tensorial ≤ 8 en servidores HGX?", options: ["Por licencias", "Los all-reduce por capa del TP necesitan NVLink; más allá de 8 GPUs cruzan InfiniBand", "Es un límite de PyTorch", "Por alineación de memoria"], answer: 1, explain: "Un dominio NVLink HGX tiene 8 GPUs. Más allá, el tráfico crítico de latencia pasa a la red más lenta." },
    { kind: "number", prompt: "El TP estilo Megatron necesita cuántos all-reduce de activaciones por capa transformer por micro-batch (forward + backward)?", answer: 4, tolerance: 0, explain: "Uno para la atención y otro para el MLP en el forward, y lo mismo en el backward." },
  ],
  "pipeline-parallelism": [
    { kind: "number", prompt: "p = 4 etapas de pipeline, m = 12 micro-batches por paso. Fracción de burbuja (p−1)/(m+p−1), en %?", answer: 20, tolerance: 1, unit: "%", explain: "3 ÷ 15 = 20% del paso es llenado y vaciado ocioso." },
    { kind: "choice", prompt: "¿Cómo se achica la burbuja del pipeline?", options: ["Más micro-batches por paso", "Menos GPUs", "Un learning rate mayor", "Desactivando el solapamiento"], answer: 0, explain: "Más micro-batches (acumulación de gradientes) amortizan el llenado y vaciado. Los calendarios intercalados también ayudan." },
  ],
  roofline: [
    { kind: "number", prompt: "H100 en BF16: 989 TFLOP/s máximos y 3.35 TB/s de HBM. ¿Dónde está el punto de inflexión, en FLOPs por byte?", answer: 295, tolerance: 10, unit: "FLOP/B", explain: "989e12 ÷ 3.35e12 ≈ 295. Por debajo estás limitado por memoria; por encima, por cómputo." },
    { kind: "choice", prompt: "Un kernel con intensidad aritmética 10 corre en una H100. Puede alcanzar aproximadamente…", options: ["989 TFLOP/s", "~33 TFLOP/s (limitado por memoria)", "3.35 TFLOP/s", "0"], answer: 1, explain: "min(989, 10 × 3.35) = 33.5 TFLOP/s. Fusionar operaciones aumenta la intensidad." },
  ],
  mfu: [
    { kind: "number", prompt: "Un modelo de 7B entrena a 500k tokens/s en 32 H100 (989 TFLOP/s cada una). MFU = 6·N·tokens/s ÷ (GPUs × pico). ¿En %?", answer: 66, tolerance: 2, unit: "%", explain: "6 × 7e9 × 5e5 = 2.1e16; 32 × 989e12 = 3.16e16, lo que da ≈ 66%." },
    { kind: "choice", prompt: "¿Los FLOPs recalculados por el checkpointing de activaciones cuentan para el MFU?", options: ["Sí", "No: si los cuentas obtienes el HFU (hardware FLOPs utilization)"], answer: 1, explain: "El MFU solo premia los FLOPs útiles del modelo, así que no se puede inflar con recomputación." },
  ],
  "all-reduce": [
    { kind: "number", prompt: "All-reduce en anillo de 1 GB entre 8 GPUs a 100 GB/s por enlace, ignorando la latencia: 2(n−1)/n · S/B. ¿Tiempo en ms?", answer: 17.5, tolerance: 0.5, unit: "ms", explain: "2 × 7/8 × 1 GB ÷ 100 GB/s = 17.5 ms." },
    { kind: "choice", prompt: "Los algoritmos de all-reduce en árbol ganan a los anillos sobre todo con…", options: ["Mensajes enormes en pocas GPUs", "Mensajes pequeños a gran escala, donde domina la latencia", "Una sola GPU", "Tráfico de almacenamiento"], answer: 1, explain: "Los árboles necesitan ~log₂(n) pasos de latencia en lugar de ~2(n−1)." },
  ],
  "scaling-efficiency": [
    { kind: "number", prompt: "Ley de Amdahl: el 5% del trabajo es serial. ¿Cuál es la aceleración máxima, incluso con GPUs infinitas?", answer: 20, tolerance: 0, unit: "×", explain: "1 ÷ 0.05 = 20×." },
    { kind: "number", prompt: "1 GPU hace 10k tokens/s; 64 GPUs hacen 512k tokens/s. ¿Eficiencia de escalado, en %?", answer: 80, tolerance: 1, unit: "%", explain: "512k ÷ (64 × 10k) = 0.8." },
  ],
  "input-pipeline": [
    { kind: "choice", prompt: "El log de tu trabajo dice esto. ¿Cuál es el mejor primer arreglo?", code: "[rank0] step 120 | loss 3.112 | 1.02 s/step | 128.4k tok/s | MFU 32.5% | dataloader wait", options: ["Más workers del dataloader, o datos pre-tokenizados", "Más paralelismo tensorial", "Un learning rate más bajo", "Desactivar el solapamiento"], answer: 0, explain: "Las GPUs están esperando al pipeline de entrada en la CPU, así que hay que alimentarlas más rápido." },
    { kind: "number", prompt: "Cada worker tokeniza 8k tokens/s. Un rango necesita 64k tokens por paso de 1 segundo. ¿Cuántos workers como mínimo?", answer: 8, tolerance: 0, explain: "64k ÷ 8k = 8 workers, más un margen en la práctica." },
  ],
  "power-capping": [
    { kind: "choice", prompt: "¿Por qué un límite de potencia cuesta menos rendimiento que la potencia que ahorra?", options: ["La potencia dinámica ∝ f·V², y el voltaje debe subir con la frecuencia", "Las GPUs ignoran los límites", "Los límites solo afectan la memoria", "No es así"], answer: 0, explain: "Los últimos cientos de MHz son los más caros, así que quitarlos ahorra muchos watts." },
    { kind: "choice", prompt: "Limitas solo 1 de las 16 GPUs de un trabajo de entrenamiento. ¿Qué pasa?", options: ["Ahorra 1/16 de la potencia sin costo", "Crea un straggler que frena a las 16", "Nada", "El trabajo falla"], answer: 1, explain: "El entrenamiento síncrono va al ritmo de la GPU más lenta. Limítalas todas por igual." },
  ],
  "energy-and-carbon": [
    { kind: "number", prompt: "Carga de TI de 100 kW, PUE 1.3, durante 24 horas. ¿Energía de la instalación en MWh?", answer: 3.12, tolerance: 0.05, unit: "MWh", explain: "100 kW × 1.3 × 24 h = 3,120 kWh = 3.12 MWh." },
    { kind: "number", prompt: "3,000 kWh en una red con 0.4 kg CO₂e por kWh. ¿Cuántos kg de CO₂e?", answer: 1200, tolerance: 0, unit: "kg", explain: "3,000 × 0.4 = 1,200 kg. El mismo trabajo en una región más limpia podría ser varias veces menor." },
  ],
  "containers-and-gpus": [
    { kind: "choice", prompt: "Cuando un contenedor usa una GPU, ¿de dónde viene el driver del kernel?", options: ["De la imagen", "Del host, inyectado por el NVIDIA Container Toolkit", "De Docker Hub", "De PyTorch"], answer: 1, explain: "Las imágenes traen el runtime de CUDA; el driver (un módulo del kernel) siempre viene del host." },
    { kind: "choice", prompt: "¿Los contenedores de entrenamiento deberían correr con `--privileged`?", options: ["Sí, por velocidad", "No: da acceso a dispositivos de forma acotada a través del runtime"], answer: 1, explain: "Los contenedores privilegiados pueden escapar al host. El acceso a GPU no lo necesita." },
  ],
  "multi-tenancy": [
    { kind: "choice", prompt: "¿Qué forma de compartir una GPU da memoria y SM aislados por hardware?", options: ["Time-slicing", "MPS", "MIG", "CUDA streams"], answer: 2, explain: "MIG particiona SM, L2 y controladores de memoria. MPS y time-slicing los comparten." },
    { kind: "choice", prompt: "¿Cuál es la mejor forma de asegurar que las GPUs solo se usen a través del planificador?", options: ["Un documento de políticas", "Controles de dispositivos de cgroups que restringen /dev/nvidia* a las asignaciones de trabajos", "Pedirlo amablemente a los usuarios", "Desinstalar nvidia-smi"], answer: 1, explain: "Hacer cumplir le gana a la política: los procesos fuera de una asignación simplemente no pueden abrir el dispositivo." },
  ],
  mig: [
    { kind: "number", prompt: "¿Cuál es el número máximo de instancias MIG en una H100?", answer: 7, tolerance: 0, explain: "Siete slices de cómputo, así que hasta siete instancias 1g." },
    { kind: "choice", prompt: "¿Caben juntas una instancia 3g.40gb y una 4g.40gb en una H100 de 80 GB (7 slices de cómputo, 8 de memoria)?", options: ["Sí: juntas usan exactamente 7 de cómputo y 8 de memoria", "No"], answer: 0, explain: "3 + 4 = 7 slices de cómputo y 4 + 4 = 8 de memoria. Encajan perfecto." },
  ],
  "exposed-notebooks": [
    { kind: "choice", prompt: "¿Por qué esto es alarmante en un nodo de cómputo?", code: '$ ss -tlnp\nLISTEN 0 128 0.0.0.0:8888 0.0.0.0:* users:(("python3",pid=2741))', options: ["El puerto 8888 es lento", "Un servidor de notebooks (ejecución remota de código) escucha en todas las interfaces", "python3 está obsoleto", "No lo es"], answer: 1, explain: "0.0.0.0 significa alcanzable desde la red. Sin token, cualquiera puede ejecutar código como ese usuario." },
    { kind: "choice", prompt: "¿Cuál es una forma más segura de usar Jupyter en un clúster?", options: ["Desactivar el token por comodidad", "Escuchar en 127.0.0.1 y usar un túnel SSH o un gateway autenticado", "Abrir el puerto 8888 en el firewall", "Ejecutarlo como root"], answer: 1, explain: "Mantenlo local y autenticado: túneles SSH o JupyterHub con SSO." },
  ],
  cryptojacking: [
    { kind: "choice", prompt: "Matas un proceso minero y reaparece un minuto después. ¿Qué revisas primero?", options: ["La temperatura de la GPU", "La persistencia (entradas de cron, unidades de systemd) y la puerta de entrada original", "Las particiones de Slurm", "La configuración de NCCL"], answer: 1, explain: "Algo lo está reiniciando. Elimina la persistencia y cierra la puerta por la que entró." },
    { kind: "choice", prompt: "¿Las conexiones salientes a qué puertos suelen indicar tráfico de pools de minería (stratum)?", options: ["22 / 443", "3333 / 4444", "53", "6818"], answer: 1, explain: "Los pools stratum suelen usar puertos como 3333, 4444 y 5555. Búscalos en `ss -tnp` y en los logs del firewall." },
  ],
  "supply-chain-and-secrets": [
    { kind: "choice", prompt: "¿Qué formato es más seguro para pesos de modelos descargados?", options: ["pickle (.bin / .pt)", "safetensors", "zip", "csv"], answer: 1, explain: "Cargar un pickle puede ejecutar código arbitrario. safetensors son solo datos de tensores." },
    { kind: "choice", prompt: "¿De dónde deberían venir las credenciales de nube de un trabajo?", options: ["Incrustadas en la imagen del contenedor", "Escritas en el script #SBATCH", "De un gestor de secretos, inyectadas en tiempo de ejecución y acotadas al trabajo", "Del README del repositorio"], answer: 2, explain: "Los secretos de corta duración y mínimo privilegio inyectados en ejecución nunca terminan en imágenes ni en el historial de git." },
  ],
};
