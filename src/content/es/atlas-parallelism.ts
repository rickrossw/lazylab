import type { AtlasText } from "./types";

export const PARALLELISM_ES: Record<string, AtlasText> = {
  "data-parallelism": {
    title: "Paralelismo de datos (DDP)",
    summary: "Cada GPU tiene una réplica completa del modelo, procesa datos distintos y promedia los gradientes en cada paso.",
    body: `La forma más simple de escalar: replica el modelo en *N* GPUs, dale a cada una una parte distinta del batch y luego **haz all-reduce de los gradientes** para que cada réplica dé el mismo paso del optimizador.

**Costo**: un all-reduce del gradiente completo (2 bytes × parámetros en BF16) por paso. Con [[all-reduce|all-reduce en anillo]], el tráfico por GPU es ~2× el tamaño del gradiente, *independiente de N*. Por eso el paralelismo de datos escala tan bien.

**Cómo hacerlo rápido**
- **Solapamiento**: DDP agrupa los gradientes en buckets y hace all-reduce de cada bucket en cuanto el backward lo produce, ocultando la comunicación detrás del cómputo (ver [[cuda-streams]]).
- **Acumulación de gradientes**: corre varios micro-batches antes de sincronizar. Obtienes un batch global mayor con la misma memoria y menos sincronizaciones por token.

**Límite**: cada GPU debe tener el estado *completo* del modelo. Cuando eso deja de caber, ver [[zero-fsdp|ZeRO y FSDP]], [[tensor-parallelism|paralelismo tensorial]] y [[pipeline-parallelism|paralelismo de pipeline]].`,
  },
  "all-reduce": {
    title: "All-reduce (anillo y árbol)",
    summary: "Suma un buffer entre todos los rangos y entrega el resultado a todos. La colectiva de la que vive el entrenamiento con paralelismo de datos.",
    body: `El **all-reduce en anillo** ordena *n* rangos en un anillo y ejecuta dos fases (reduce-scatter y luego all-gather) de *n−1* pasos cada una. Cada rango envía y recibe ~2(n−1)/n × el tamaño del buffer:

\`\`\`
T_anillo ≈ 2(n−1)/n · S/B  +  2(n−1) · α
\`\`\`

donde *S* son los bytes, *B* el ancho de banda por enlace y *α* la latencia por paso. El término de ancho de banda casi no crece con *n*. El de latencia sí, y eso castiga a los mensajes pequeños a gran escala.

Los algoritmos de **árbol** (el doble árbol binario de NCCL) reducen el término de latencia a ~log₂(n) pasos y ganan con mensajes pequeños y muchísimos rangos.

El **bus bandwidth**, el número que reporta nccl-tests, elimina el factor 2(n−1)/n para que puedas compararlo directamente con la velocidad del enlace. Un nodo NVLink sano muestra cientos de GB/s. Uno con un enlace degradado muestra cifras de PCIe.

Usa el widget para ver cómo se relacionan el tamaño, el número de rangos y el ancho de banda.`,
  },
  "tensor-parallelism": {
    title: "Paralelismo tensorial",
    summary: "Divide las matrices de cada capa entre GPUs (estilo Megatron). Caben modelos enormes, pero cada capa necesita colectivas.",
    body: `El paralelismo tensorial (TP) reparte las matrices de pesos *dentro* de cada capa. En el esquema de Megatron-LM, la primera matmul del MLP se divide por columnas y la segunda por filas, así que una capa solo necesita **un all-reduce en el forward y uno en el backward**. Con la atención tratada igual, son ~4 all-reduce de activaciones por capa transformer por micro-batch.

**Compromisos**
- ✅ Pesos, gradientes, estado del optimizador *y* activaciones se reducen por el grado de TP.
- ❌ La comunicación es frecuente, sensible a la latencia y está en el camino crítico. Casi no se puede ocultar.
- ❌ Los shards se vuelven estrechos: hidden/TP demasiado pequeño significa GEMM pequeñas y menor eficiencia de los [[tensor-core|tensor cores]].

**Regla**: mantén el TP dentro del dominio [[nvlink]] (TP ≤ 8 en servidores HGX). TP=16 a través de [[infiniband]] es una forma clásica de desperdiciar un clúster.`,
  },
  "pipeline-parallelism": {
    title: "Paralelismo de pipeline",
    summary: "Divide la pila de capas en etapas en GPUs distintas y pasa micro-batches en cadena. Poco tráfico, pero con una burbuja.",
    body: `El paralelismo de pipeline (PP) asigna capas contiguas a etapas. La etapa 1 corre las capas 1–20, la etapa 2 las 21–40, y así. Solo las activaciones en los bordes entre etapas cruzan la red, así que PP se lleva bien con varios nodos sobre [[infiniband]].

**La burbuja**: al inicio y al final de cada paso algunas etapas quedan ociosas mientras el pipeline se llena y se vacía. Con *p* etapas y *m* micro-batches por paso (calendario 1F1B):

\`\`\`
fracción de burbuja ≈ (p − 1) / (m + p − 1)
\`\`\`

Más micro-batches (acumulación de gradientes) achican la burbuja. Los calendarios intercalados la reducen más, a cambio de más comunicación.

**Restricciones**: el número de capas debe dividirse (casi) por igual entre etapas, y las etapas deben estar equilibradas. La primera etapa además guarda la mayor cantidad de activaciones en vuelo.

La receta clásica para modelos grandes, el **paralelismo 3D**, combina los tres: TP dentro del nodo, PP entre unos pocos nodos y [[data-parallelism|DP]] (a menudo con [[zero-fsdp|ZeRO-1]]) en todo lo demás.`,
  },
  "zero-fsdp": {
    title: "ZeRO y FSDP",
    summary: "Reparte el estado del optimizador, los gradientes y los parámetros entre los rangos de paralelismo de datos en lugar de replicarlos.",
    body: `El [[data-parallelism|paralelismo de datos]] simple desperdicia memoria: cada rango guarda copias idénticas de todo. **ZeRO** (y **FSDP** de PyTorch) lo reparten:

| Etapa | Repartido | Estado por GPU (Adam en precisión mixta) |
|---|---|---|
| 0 | nada | 16 B/parámetro |
| 1 | estados del optimizador | 4 + 12/N B/parámetro |
| 2 | + gradientes | 2 + 14/N B/parámetro |
| 3 / FSDP | + parámetros | 16/N B/parámetro |

**El problema de la etapa 3**: los parámetros deben reunirse con **all-gather** antes del forward *y* del backward de cada capa, en cada micro-batch. Para un modelo de 70B son ~140 GB movidos dos veces por micro-batch. Sobre NVLink va bien. Sobre una NIC de 400 Gb/s puede dominar el paso.

**Guía práctica**
- ZeRO-1 es casi gratis y casi siempre vale la pena.
- ZeRO-3/FSDP es excelente dentro de un nodo o en redes rápidas, y para hacer caber un modelo que de otro modo no cabría.
- A gran escala, combínalo: TP dentro del nodo, ZeRO-1 o *sharding híbrido* (repartir dentro del nodo, replicar entre nodos).`,
  },
  "mixed-precision": {
    title: "Precisión mixta (BF16, FP8)",
    summary: "Haz las cuentas en formatos de 16 u 8 bits en los tensor cores y guarda una copia maestra en FP32 para actualizaciones estables.",
    body: `El entrenamiento en precisión mixta ejecuta el forward y el backward en un formato de baja precisión y mantiene **pesos maestros en FP32** para la actualización del optimizador:

- **BF16** conserva el rango de exponente de FP32, así que rara vez necesita loss scaling. Es lo predeterminado en A100/H100.
- **FP16** necesita **loss scaling** dinámico para que los gradientes pequeños no se vuelvan cero.
- **FP8** (H100 en adelante) vuelve a duplicar aproximadamente el rendimiento de las matmul. Bibliotecas como Transformer Engine gestionan el escalado por tensor.

**Por qué es tan importante**: los [[tensor-core|tensor cores]] entregan ~15× más FLOP/s en BF16 que en FP32 simple en una H100. Entrenar en FP32 deja casi toda la GPU ociosa.

**Memoria**: pesos y gradientes en 2 bytes, más 12 bytes de estado del optimizador en FP32 (maestro, m y v de Adam), da la regla de "16 bytes por parámetro" que se usa en todo LazyLab.`,
  },
  "activation-checkpointing": {
    title: "Checkpointing de activaciones",
    summary: "Descarta activaciones en el forward y recalcúlalas en el backward: cambia ~33% más de cómputo por mucha menos memoria.",
    body: `La retropropagación necesita las activaciones del forward. Para una capa transformer con FlashAttention son aproximadamente **34 · s · b · h bytes** (secuencia × micro-batch × hidden), y se acumulan rápido. Un modelo de 7B con micro-batch 4 necesita más de 70 GB de activaciones.

El **checkpointing** (también llamado *recomputación*) guarda solo la entrada de cada capa y vuelve a ejecutar el forward de la capa durante el backward. Costo: un forward extra, ~33% más de cómputo (8N en lugar de 6N FLOPs por token). Beneficio: la memoria de activaciones baja a unos **2 · s · b · h bytes por capa**.

**Úsalo cuando** las activaciones son lo que te impide hacer caber el modelo o un micro-batch mayor. **Apágalo cuando** la memoria alcanza. Entonces es puro costo. El checkpointing selectivo (solo el interior de la atención) logra la mayor parte del ahorro por una fracción del costo.

Nota que el [[mfu|MFU]] deliberadamente no cuenta los FLOPs recalculados, así que el checkpointing baja el MFU aunque la GPU esté igual de ocupada.`,
  },
  roofline: {
    title: "Modelo roofline",
    summary: "FLOP/s alcanzables = min(cómputo máximo, intensidad aritmética × ancho de banda de memoria). Te dice contra qué muro chocas.",
    body: `Todo kernel tiene una **intensidad aritmética** (IA): FLOPs realizados por byte movido desde memoria. El roofline dice:

\`\`\`
FLOP/s alcanzables = min( FLOP/s máximos ,  IA × ancho de banda de memoria )
\`\`\`

En ejes log-log obtienes un "techo de memoria" inclinado que se une con un "techo de cómputo" plano en el **punto de inflexión** (ridge point). Para una H100 en BF16 es ~989 TFLOP/s ÷ 3.35 TB/s ≈ **295 FLOPs/byte**.

- Las operaciones elemento a elemento (suma, GELU, layer norm) tienen IA cercana a 1. Están irremediablemente limitadas por memoria, así que **fusiónalas**.
- Las matmul grandes tienen IA de miles. Están limitadas por cómputo, y ahí brillan los [[tensor-core|tensor cores]].
- La atención sin fusionar está limitada por memoria. FlashAttention la reorganiza para quedarse en el chip.

La guía GPGPU de PRACE usa el mismo razonamiento para kernels de HPC: primero decide bajo qué techo estás y luego optimiza *ese* recurso.`,
  },
  mfu: {
    title: "MFU (Model FLOPs Utilization)",
    summary: "FLOPs útiles del modelo por segundo divididos entre el máximo del hardware. La cifra honesta de eficiencia de entrenamiento.",
    body: `Para transformers densos, entrenar cuesta unos **6 × parámetros × tokens** FLOPs (2 en el forward + 4 en el backward). El MFU compara lo que lograste con el máximo teórico:

\`\`\`
MFU = (6 · N · tokens_por_segundo) / (núm_GPUs · FLOP/s_máximos)
\`\`\`

Ignora deliberadamente la recomputación del [[activation-checkpointing|checkpointing de activaciones]] (eso es *HFU*, hardware FLOPs utilization), así que solo premia el trabajo útil.

**¿Qué es bueno?** Entre 35 y 55% es típico para entrenamiento bien afinado de modelos grandes en clústeres tipo H100. Más de 60% es excelente.

**Qué lo hunde**: micro-batches pequeños, comunicación expuesta (sin solapamiento), burbujas de pipeline, esperas del dataloader, [[stragglers]], relojes limitados y FP32 simple. La misión *Feed the Beast* los recorre en orden.`,
  },
  "scaling-efficiency": {
    title: "Eficiencia de escalado",
    summary: "Por qué 2× GPUs rara vez da 2× velocidad: trabajo serial, comunicación y sincronización (la ley de Amdahl y compañía).",
    body: `**Ley de Amdahl**: si una fracción *s* del trabajo es serial, la aceleración con *n* trabajadores es como máximo 1 / (s + (1−s)/n). Incluso un 5% serial te limita a 20× de aceleración.

El entrenamiento distribuido agrega **comunicación que crece con la escala**: términos de latencia de las colectivas, saltos entre racks y una probabilidad creciente de que *alguna* GPU sea lenta (ver [[stragglers]]).

**Escalado débil vs. fuerte**
- *Escalado fuerte*: mismo problema, más GPUs. La eficiencia cae a medida que el trabajo por GPU se achica.
- *Escalado débil*: el batch crece con el número de GPUs. Es mucho más amable, y por eso existe el entrenamiento con batches grandes, dentro de lo que todavía converge.

**Cómo medirlo**: eficiencia de escalado = (rendimiento con n) / (n × rendimiento con 1). Repórtala junto con el [[mfu|MFU]]. Un trabajo puede escalar perfecto y aun así ser ineficiente por GPU.`,
  },
  "memory-coalescing": {
    title: "Coalescencia de memoria",
    summary: "Cuando los 32 hilos de un warp leen direcciones contiguas, el hardware los une en unas pocas transacciones anchas.",
    body: `La memoria global se accede en segmentos alineados (sectores de 32 bytes, agrupados en líneas de 128 bytes). Si los 32 hilos de un [[warp]] leen 32 floats consecutivos de 4 bytes, el hardware los atiende con **una** transacción de 128 bytes. Si leen con un salto grande, puede necesitar **32** transacciones separadas, una penalización de 32× en ancho de banda.

**Arreglos clásicos de la práctica de programación de GPU (p. ej. la guía de PRACE)**
- Estructura de arreglos en lugar de arreglo de estructuras.
- Que el hilo *i* toque el elemento *i*, no *i × salto*.
- Pasar los patrones de acceso incómodos (transposiciones, stencils) por **memoria compartida** y luego escribir de forma coalescente.
- Cuidado con los **conflictos de bancos** de memoria compartida al hacerlo.

Los profilers (Nsight Compute) reportan "sectores por solicitud". Lo ideal es 4 para cargas de 4 bytes.`,
  },
  occupancy: {
    title: "Ocupación",
    summary: "Warps residentes por SM como fracción del máximo: el repertorio del planificador para ocultar latencia.",
    body: `Cada SM puede alojar un número limitado de warps (64 en la H100). La **ocupación** es cuántos están realmente residentes, limitada por el uso de cada bloque de:

- **Registros** por hilo (el banco de registros lo comparten todos los warps residentes),
- **Memoria compartida** por bloque,
- **Hilos** por bloque y bloques por SM.

Mayor ocupación le da al planificador de warps más candidatos a los que cambiar mientras otros esperan a la memoria. Pero es un medio, no un fin. Muchos kernels rápidos (GEMM grandes, FlashAttention) corren con ocupación *baja* y usan registros y memoria compartida para reutilizar datos.

**Enfoque práctico** (según las buenas prácticas de CUDA y PRACE): usa la calculadora de ocupación o Nsight Compute para ver el recurso limitante, prueba algunos tamaños de bloque (múltiplos de 32) y mide. No supongas.`,
  },
  "input-pipeline": {
    title: "Pipeline de entrada",
    summary: "Leer, decodificar y tokenizar datos lo bastante rápido para alimentar a las GPUs: el cuello de botella después de arreglar todo lo demás.",
    body: `Cuando las cuentas del modelo ya son rápidas, el lado de la CPU suele ser el límite: leer shards del almacenamiento, descomprimir, tokenizar, mezclar y armar batches.

**Síntomas**: la utilización de GPU sube y baja en dientes de sierra, el tiempo por paso no mejora al optimizar el modelo y los logs muestran tiempo esperando el siguiente batch.

**Arreglos**
- Más workers del dataloader (procesos) por rango y memoria pinned.
- **Precarga**: prepara el batch *k+1* mientras entrena el batch *k* (ver [[cuda-streams]]).
- Tokeniza por adelantado y guarda shards binarios empaquetados. Es la mayor ganancia para el preentrenamiento de LLM.
- Asegúrate de que el sistema de archivos paralelo o el almacenamiento de objetos entregue el ancho de banda agregado: *GPUs × tokens/s × bytes por token*, más el tráfico de checkpoints.

La misión *Feed the Beast* muestra cómo el cuello de botella pasa a la carga de datos en cuanto se arregla la comunicación.`,
  },
};
