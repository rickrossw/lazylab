import type { AtlasText } from "./types";

export const HARDWARE_ES: Record<string, AtlasText> = {
  gpu: {
    title: "GPU",
    summary: "Un procesador de alto rendimiento: miles de carriles simples que ocultan la latencia con paralelismo en lugar de cachés y predicción.",
    body: `Una CPU dedica sus transistores a que *un* hilo vaya rápido: cachés profundas, predicción de saltos, ejecución fuera de orden. Una GPU los dedica a **muchos** carriles de aritmética. Oculta la latencia de memoria manteniendo miles de hilos en vuelo y cambiando entre ellos sin costo.

Para ML y HPC ese intercambio es ideal. El trabajo es sobre todo álgebra lineal densa: la misma operación sobre arreglos enormes. Una GPU de centro de datos como la H100 combina ~130 [[streaming-multiprocessor|streaming multiprocessors]] con [[tensor-core|tensor cores]] y 80 GB de [[hbm|HBM]] a varios TB/s.

**Qué hace rápida a una GPU en la práctica**
- Suficiente trabajo paralelo para llenar todos los SM (ver [[occupancy|ocupación]]).
- Intensidad aritmética lo bastante alta para estar limitado por cómputo y no por memoria (ver [[roofline]]).
- Datos que se quedan en el dispositivo. Las transferencias por PCIe son ~50× más lentas que HBM.

En un clúster, la GPU es un nodo de una jerarquía: GPU → [[nvlink]] dentro del servidor → [[infiniband]] entre servidores. Casi toda la ingeniería de clústeres consiste en mantener ocupada esa jerarquía.`,
  },
  "streaming-multiprocessor": {
    title: "Streaming Multiprocessor (SM)",
    summary: "El bloque básico de la GPU: planificadores, registros, memoria compartida, CUDA cores y tensor cores.",
    body: `Un SM es más o menos lo que un "núcleo" es en una CPU, pero diseñado para rendimiento. Cada SM tiene planificadores de warps, un banco de registros grande, **memoria compartida / L1** configurable y unidades de ejecución: "CUDA cores" FP32/INT, unidades de funciones especiales y [[tensor-core|tensor cores]].

Un lanzamiento de kernel se divide en **thread blocks**. Cada bloque cae en un SM y se queda ahí. El SM intercala los [[warp|warps]] de todos los bloques residentes en cada ciclo, así que cuando un warp espera a la memoria otro emite instrucciones.

**Por qué te importa como operador**
- Número de SM × reloj fija los FLOP/s máximos. Una GPU limitada al 55% del reloj (por temperatura o potencia) entrega ~55% del cómputo. Ver [[power-and-thermals|potencia y temperatura]].
- \`DCGM_FI_PROF_SM_ACTIVE\` y \`SM_OCCUPANCY\` (de [[dcgm]]) te dicen si los SM están realmente ocupados. La "GPU utilization" de [[nvidia-smi]] solo significa que *algún* kernel estaba corriendo, no que todos los SM trabajaran.`,
  },
  warp: {
    title: "Warp y SIMT",
    summary: "32 hilos que ejecutan al unísono. Las ramas divergentes y los accesos dispersos a memoria cuestan rendimiento real.",
    body: `Las GPU de NVIDIA ejecutan los hilos en grupos de **32 llamados warps**. Es *Single Instruction, Multiple Threads* (SIMT): el warp comparte un flujo de instrucciones y cada hilo tiene sus propios registros.

Dos consecuencias dominan el rendimiento de los kernels:

1. **Divergencia de ramas**: si los hilos de un warp toman caminos distintos en un \`if\`, el warp ejecuta *ambos* caminos con carriles enmascarados. Mantén el control de flujo uniforme dentro del warp cuando puedas.
2. **Coalescencia de memoria**: cuando los 32 hilos leen direcciones contiguas, el hardware las une en unas pocas transacciones anchas. Los accesos dispersos multiplican el tráfico de memoria. Ver [[memory-coalescing|coalescencia de memoria]].

Los warps también son la unidad que el planificador hace malabares para ocultar la latencia. Más warps residentes (mayor [[occupancy|ocupación]]) le dan más opciones, hasta que se agotan los registros y la memoria compartida.`,
  },
  "tensor-core": {
    title: "Tensor Core",
    summary: "Unidades de multiplicar y acumular matrices que aportan la mayoría de los FLOPs de una GPU moderna, si las alimentas con la precisión y formas correctas.",
    body: `Los tensor cores calculan productos de matrices pequeñas (p. ej. bloques de 16×16) en una sola instrucción. En una H100 entregan ~989 TFLOP/s densos en BF16 frente a ~67 TFLOP/s en FP32 simple. Esa diferencia es la razón por la que el entrenamiento en [[mixed-precision|precisión mixta]] es lo normal.

**Cómo obtener los FLOPs**
- Usa BF16/FP16 (o FP8 con Transformer Engine) para las multiplicaciones de matrices. FP32 sin TF32 nunca los usa.
- Mantén las dimensiones de las GEMM grandes y múltiplos de 8/16. Micro-batches diminutos o shards de [[tensor-parallelism|paralelismo tensorial]] muy estrechos generan GEMM pequeñas que no saturan las unidades.
- Mantén los datos fluyendo desde [[hbm|HBM]]. Los tensor cores son tan rápidos que muchas operaciones (normalización, activaciones, softmax de atención) pasan a estar limitadas por memoria. Para eso existe la fusión de kernels como FlashAttention.

El Model FLOPs Utilization ([[mfu]]) es, en el fondo, una medida de qué tan ocupados están los tensor cores.`,
  },
  hbm: {
    title: "HBM y la jerarquía de memoria",
    summary: "High Bandwidth Memory: DRAM apilada junto al chip de la GPU. Su capacidad limita el tamaño del modelo y su ancho de banda limita muchos kernels.",
    body: `La High Bandwidth Memory apila chips de DRAM junto a la GPU sobre un interposer de silicio. Una H100 SXM tiene 80 GB a ~3.35 TB/s. Debajo están la L2 (decenas de MB), la memoria compartida/L1 de cada SM y los registros, cada uno más pequeño y más rápido.

**La capacidad** es el primer muro en el entrenamiento de modelos grandes. Adam en precisión mixta necesita ~16 bytes por parámetro (pesos, gradientes, copia maestra FP32 y dos momentos), *antes* de las activaciones. Un modelo de 7B necesita ~107 GB solo de estado, más de lo que cabe en una GPU. Por eso existen [[zero-fsdp|ZeRO/FSDP]], el [[tensor-parallelism|paralelismo tensorial]] y el [[activation-checkpointing|checkpointing de activaciones]].

**El ancho de banda** es el segundo muro. Cualquier kernel con baja intensidad aritmética (operaciones elemento a elemento, normalizaciones, matrices pequeñas) está limitado por el ancho de banda de HBM, no por los FLOPs. Ver [[roofline]].

Prueba la calculadora de abajo: cambia el modelo, la etapa de ZeRO y el paralelismo, y mira la memoria por GPU frente a la línea de 80 GB.`,
  },
  mig: {
    title: "Multi-Instance GPU (MIG)",
    summary: "Partición por hardware de una GPU en hasta siete instancias aisladas, cada una con sus propios SM, slices de L2 y memoria.",
    body: `MIG (A100, H100 y posteriores) divide una GPU en hasta **7 instancias**. Cada una recibe una porción dedicada de SM, caché L2 y HBM, con sus propios controladores de memoria. Las fallas y la presión de memoria de una instancia no afectan a otra, lo que hace de MIG la opción más fuerte para compartir GPU. Ver [[multi-tenancy|multi-tenencia]].

Los perfiles se nombran por slices de cómputo y memoria; por ejemplo, en una H100 de 80 GB: \`1g.10gb\`, \`2g.20gb\`, \`3g.40gb\`, \`4g.40gb\`, \`7g.80gb\`. No todas las combinaciones caben. La colocación sigue reglas fijas sobre qué slices pueden ir juntos.

**Cuándo usarlo**: inferencia, notebooks y cargas de CI que necesitan una fracción de GPU y *no deben* interferir entre sí. **Cuándo no**: trabajos de entrenamiento grandes. Esos quieren GPUs completas y NVLink, que las instancias MIG no pueden usar para comunicación peer-to-peer.

Juega con el particionador de abajo para ver cómo encajan los perfiles.`,
  },
  "power-and-thermals": {
    title: "Potencia y temperatura",
    summary: "Las GPUs bajan sus relojes para no pasar su límite de potencia y sus umbrales térmicos, y la GPU más lenta marca el ritmo.",
    body: `Cada GPU tiene un **límite de potencia** (TDP; 700 W en la H100 SXM) y **umbrales térmicos**. Cuando superaría cualquiera de ellos, el firmware baja los relojes:

- **SW Power Cap**: está consumiendo el límite configurado; los relojes bajan un poco. Suele ser intencional. Ver [[power-capping|limitación de potencia]].
- **HW Slowdown / HW Thermal Slowdown**: un freno de emergencia, normalmente por sobrecalentamiento (ventilador fallido, flujo de aire bloqueado, aire de entrada caliente). Los relojes pueden bajar a la mitad.

En el entrenamiento síncrono, una sola GPU limitada se convierte en una ralentización de todo el clúster. Cada colectiva la espera. Eso es un [[stragglers|straggler]].

**Dónde mirar**
- \`nvidia-smi -q -d PERFORMANCE\` muestra las "Clocks Event Reasons" (antes *throttle reasons*).
- \`nvidia-smi -q -d TEMPERATURE\` muestra la temperatura actual, la de slowdown y la de apagado.
- Campos de [[dcgm]] como \`DCGM_FI_DEV_GPU_TEMP\`, \`DCGM_FI_DEV_POWER_USAGE\` y la máscara de throttling de reloj alimentan las alertas.`,
  },
  pcie: {
    title: "PCIe",
    summary: "El bus de uso general entre CPU, GPU, NIC y NVMe. Está en todas partes, pero es un orden de magnitud más lento que NVLink.",
    body: `PCI Express conecta las GPUs con la CPU del host, las NIC y el almacenamiento. Un enlace Gen5 x16 mueve ~64 GB/s por dirección; Gen4 x16, ~32 GB/s. Es suficiente para cargar datos, pero lento para el tráfico GPU a GPU durante el entrenamiento.

**Por qué importa**
- Las GPUs sin [[nvlink]] (p. ej. L40S) deben hacer todo el tráfico entre pares por PCIe, a menudo pasando por el root complex de la CPU. El [[tensor-parallelism|paralelismo tensorial]] sufre mucho.
- **GPUDirect RDMA** permite que una NIC lea y escriba la memoria de la GPU directamente por PCIe, sin pasar por la memoria del host. Los buenos servidores ponen cada GPU con una NIC bajo el mismo switch PCIe. Compruébalo con \`nvidia-smi topo -m\`.
- "Fallen off the bus" ([[xid-errors|Xid 79]]) significa literalmente que la GPU desapareció de PCIe.`,
  },
  nvlink: {
    title: "NVLink",
    summary: "El enlace GPU a GPU de alto ancho de banda de NVIDIA: ~450 GB/s por dirección por H100, unas 7× PCIe Gen5.",
    body: `NVLink es una interconexión punto a punto entre GPUs. Una H100 SXM tiene 18 enlaces NVLink 4 que suman ~900 GB/s bidireccionales (~450 GB/s por sentido). A través de [[nvswitch]], las 8 GPUs de un servidor HGX hablan entre sí a máxima velocidad.

**Regla de diseño**: pon el paralelismo *más conversador* en el enlace más rápido. El [[tensor-parallelism|paralelismo tensorial]] hace varios all-reduce por capa, así que vive dentro del dominio NVLink. El paralelismo de datos, que sincroniza una vez por paso y se solapa con el cómputo, puede cruzar [[infiniband]].

**Modo de falla**: los errores de NVLink aparecen como [[xid-errors|Xid 74]]. Un enlace degradado obliga a que el tráfico vaya por PCIe y ralentiza las colectivas en silencio. \`nvidia-smi nvlink -s\` muestra el estado de cada enlace, y \`all_reduce_perf\` (nccl-tests) en un nodo libre muestra la caída de ancho de banda.`,
  },
  nvswitch: {
    title: "NVSwitch",
    summary: "Un chip switch que da a cada GPU de un servidor NVLink a pleno ancho de banda con todas las demás.",
    body: `Sin un switch, NVLink es punto a punto, así que cada GPU solo se conecta con unas pocas vecinas. **NVSwitch** construye un crossbar sin bloqueo: en un servidor HGX H100, cuatro chips NVSwitch conectan las 8 GPUs todas con todas a pleno ancho de banda NVLink.

Los sistemas más nuevos extienden el dominio NVLink *más allá* del servidor (p. ej. racks NVL72), de modo que 72 GPUs funcionan como una gran isla de paralelismo tensorial. La regla de [[nvlink]] sigue valiendo: cuanto mayor el dominio NVLink, mayores grupos de paralelismo tensorial o de expertos puedes usar sin tocar la red de escalado, más lenta.

\`nvidia-smi topo -m\` muestra \`NV18\` (18 enlaces agrupados) entre cada par de GPUs en un sistema con NVSwitch.`,
  },
  infiniband: {
    title: "InfiniBand y RoCE",
    summary: "La red de escalado: redes RDMA que mueven tensores entre servidores sin involucrar a la CPU.",
    body: `Entre servidores, las GPUs se comunican por una **red de escalado** (scale-out). Dominan dos familias:

- **InfiniBand (IB)**: una red RDMA diseñada para esto. NDR funciona a 400 Gb/s por puerto con latencia muy baja y control de flujo sin pérdidas basado en créditos.
- **RoCE v2**: RDMA sobre Ethernet convergente. La misma API de verbs sobre Ethernet. Requiere configuración cuidadosa (PFC/ECN) para no perder paquetes, pero es más barata y conocida por los equipos de redes.

Los servidores de entrenamiento modernos conectan **una NIC de 400G por GPU** (diseño rail-optimized), así que cada GPU obtiene ~50 GB/s de ancho de banda de escalado vía GPUDirect RDMA.

**Lista de verificación**
- \`ibstat\` debe mostrar cada puerto \`Active\` / \`LinkUp\` a la velocidad esperada.
- [[nccl]] registra \`NET/IB\` cuando usa RDMA y \`NET/Socket\` cuando recurrió a TCP, una clásica ralentización silenciosa de 10× (a menudo por \`NCCL_IB_DISABLE=1\` o una mala configuración de HCA).
- Si un puerto se cae a mitad de un trabajo, las colectivas se cuelgan hasta que expira el watchdog de NCCL.`,
  },
  "cluster-topology": {
    title: "Topología del clúster",
    summary: "Cómo se cablean nodos, switches y enlaces: fat trees, diseños rail-optimized y por qué la sobresuscripción castiga a las colectivas.",
    body: `La red de un clúster de GPU suele ser un **fat tree**. Los switches leaf conectan servidores y los switches spine conectan los leaf. Si la capacidad hacia arriba iguala a la de hacia abajo, la red es **sin bloqueo** (1:1). Los diseños más baratos sobresuscriben (p. ej. 2:1), lo que está bien para tráfico web y es doloroso para all-reduce, donde todos transmiten a la vez.

Los diseños **rail-optimized** conectan la NIC *i* de cada servidor al mismo switch leaf ("rail *i*"). Así, los algoritmos de anillo y árbol de NCCL mantienen la mayor parte del tráfico en un solo rail, a un salto de distancia.

**Reglas prácticas**
- La jerarquía de ancho de banda (HBM ≫ NVLink ≫ IB ≫ almacenamiento) debe corresponder a la jerarquía de paralelismo. Ver [[tensor-parallelism|paralelismo tensorial]], [[pipeline-parallelism|paralelismo de pipeline]] y [[data-parallelism|paralelismo de datos]].
- Ten capacidad de sobra. Un nodo de repuesto encendido convierte una falla de hardware en un requeue en lugar de una caída. Ver [[checkpointing]].
- La potencia y la refrigeración también son topología. Los racks tienen presupuestos de kW, y la refrigeración líquida cambia lo que cabe. Ver [[energy-and-carbon|energía y carbono]].`,
  },
};
