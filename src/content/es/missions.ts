import type { MissionText } from "./types";

export const MISSIONS_ES: Record<string, MissionText> = {
  "first-multinode": {
    title: "Dos nodos, un trabajo",
    tagline: "Tu primer trabajo de entrenamiento multinodo ni siquiera se puede enviar. Arregla el script.",
    briefing: `Una investigadora te dejó **train.sh**: un entrenamiento de 7B que debería usar **2 nodos × 8 H100**. Dice que "simplemente da error". Haz que corra en ambos nodos y asegúrate de que los nodos se comuniquen por **InfiniBand**, no por la Ethernet lenta de administración.

Comandos útiles: \`cat train.sh\`, \`nano train.sh\`, \`sinfo\`, \`sbatch train.sh\`, \`squeue\`, \`cat slurm-<jobid>.out\`.`,
    objectives: ["Un trabajo de entrenamiento corre en 2 nodos × 8 GPUs", "El tráfico entre nodos usa InfiniBand (≥ 200k tokens/s)"],
    hints: [
      "Ejecuta `sbatch train.sh` y lee el error con atención. Luego ejecuta `sinfo` para ver qué particiones existen realmente.",
      "Cada nodo tiene 8 GPUs, así que `--gpus-per-node=16` nunca se puede cumplir. Edita con `nano train.sh` y guarda con Ctrl+S.",
      "Cuando corra, `cat slurm-<id>.out` muestra `NET/Socket`: NCCL usa TCP porque `NCCL_IB_DISABLE=1`. Borra esa línea, haz `scancel` del trabajo y vuelve a enviarlo.",
    ],
    debrief: `**Lo que arreglaste**

1. **Partición**: Slurm rechaza particiones desconocidas al enviar. \`sinfo\` es la fuente de verdad.
2. **GPUs por nodo**: \`--gpus-per-node\` es *por nodo*. Para tener 16 GPUs, pide 2 nodos × 8. Slurm rechaza pedidos que ningún nodo puede cumplir ("Requested node configuration is not available").
3. **Transporte**: con \`NCCL_IB_DISABLE=1\`, NCCL recurre a sockets TCP (~3 GB/s aquí) en lugar de RDMA sobre InfiniBand (~48 GB/s por GPU). El trabajo "funciona" pero corre a un cuarto de su velocidad. La pista está en las líneas NCCL INFO del log.

**Hábito de operación**: cuando un trabajo corre pero va lento, lee las líneas de transporte de NCCL antes de afinar cualquier otra cosa.`,
  },
  "fallen-off-bus": {
    title: "Se cayó del bus",
    tagline: "Un entrenamiento murió durante la noche. Encuentra la GPU mala, pon el nodo en cuarentena y vuelve a arrancar el trabajo.",
    briefing: `El trabajo **101** (un 7B en 2 nodos) falló hace unos minutos y su dueño pregunta por qué. Tu tarea:

- averiguar **qué nodo y qué GPU** lo mataron,
- hacer **drain** de ese nodo para que el planificador deje de mandarle trabajo,
- volver a poner el entrenamiento **en marcha** en nodos sanos.

Empieza con \`sacct\`, el log del trabajo (\`cat slurm-101.out\`) y el log del kernel del nodo (\`ssh <nodo>\` y luego \`dmesg\`).`,
    objectives: ["node-2 está en drain (con un motivo)", "El trabajo de 7B vuelve a entrenar en 2 nodos sanos"],
    hints: [
      "`sacct` muestra que el trabajo 101 está FAILED. El log `cat slurm-101.out` menciona un error de CUDA en node-2.",
      "En node-2, ejecuta `dmesg | grep Xid`. Xid 79 significa que la GPU se cayó del bus PCIe. Solo un reinicio o un cambio de hardware lo arregla.",
      "Desde el nodo de login: `scontrol update NodeName=node-2 State=DRAIN Reason=\"Xid 79 gpu6\"` y luego `sbatch train.sh` (o `scontrol requeue 101`).",
    ],
    debrief: `**Xid 79: "GPU has fallen off the bus"** significa que el driver ya no puede llegar a la GPU por PCIe. Las causas incluyen problemas de alimentación, temperatura o conexión física. El software no puede arreglarlo: el nodo necesita como mínimo un reinicio, y a menudo un RMA.

**El procedimiento que acabas de seguir**
1. *Triaje desde el planificador*: \`sacct\` / el log del trabajo te dicen *qué* nodo.
2. *Confirmar en la fuente*: \`dmesg\` tiene los mensajes Xid del driver. Los módulos de kernel abiertos de NVIDIA (open-gpu-kernel-modules) son donde se emiten.
3. *Contener*: hacer **drain** del nodo (los trabajos en curso terminan, los nuevos lo evitan) con un motivo que el equipo de hardware pueda leer después en \`sinfo -R\`.
4. *Recuperar*: volver a enviar o hacer requeue. El trabajo continúa desde su último checkpoint, así que los checkpoints frecuentes reducen el daño.`,
  },
  straggler: {
    title: "El carril lento",
    tagline: "El rendimiento cayó a la mitad en 32 GPUs, pero nada falló. Encuentra al rezagado.",
    briefing: `Un modelo de 7B entrena en **4 nodos (32 H100)**, y **node-5** está libre como repuesto. Hace unos minutos los tokens/s bajaron ~45%. No hay errores en el log. Nada se cayó.

En el entrenamiento síncrono con paralelismo de datos, cada paso espera a la **GPU más lenta**. Encuéntrala, saca su nodo de rotación y vuelve a poner el MFU por encima del **60%**.

Herramientas: los paneles de la derecha, \`nvidia-smi\`, \`nvidia-smi -q -d PERFORMANCE\`, \`--query-gpu=index,temperature.gpu,clocks.sm\`, \`scontrol\`.`,
    objectives: ["El nodo con la GPU limitada está en drain", "El entrenamiento vuelve a superar el 60% de MFU en nodos sanos"],
    hints: [
      "Mira la vista de topología: una GPU está más caliente que las demás. O revisa cada nodo con `pdsh -w node-[1-4] nvidia-smi --query-gpu=index,temperature.gpu,clocks.sm --format=csv`.",
      "En node-3, `nvidia-smi -q -d PERFORMANCE -i 5` muestra `HW Thermal Slowdown: Active`, y `-d TEMPERATURE` muestra un ventilador del chasis fallido.",
      "Haz drain de node-3 con un motivo y luego `scontrol requeue 101`. El trabajo se reinicia desde su checkpoint en node-1, 2, 4 y 5.",
    ],
    debrief: `**Los stragglers son el asesino silencioso del entrenamiento síncrono.** Una GPU limitada a ~55% de reloj hizo esperar a *las 32* en cada all-reduce. Eso es una pérdida de 45% de rendimiento por un solo ventilador.

**Cómo detectar uno**
- La utilización por GPU se ve *invertida*: el straggler está al ~100% mientras las GPUs sanas muestran menos, porque esperan en la barrera.
- Su reloj de SM está bajo y las \`Clocks Event Reasons\` muestran **HW Thermal Slowdown**.
- Métricas de DCGM como \`DCGM_FI_DEV_CLOCK_THROTTLE_REASONS\` y la temperatura son lo que debería vigilar la alerta en producción.

**Arreglo**: saca el hardware de rotación (drain), reinicia desde un checkpoint en nodos sanos y abre un ticket por el ventilador. Tener un nodo de repuesto encendido es lo que hizo rápida esta recuperación.`,
  },
  "mfu-tune": {
    title: "Alimenta a la bestia",
    tagline: "16 H100 corriendo al 26% de MFU. Ajusta la configuración por encima del 55% sin quedarte sin memoria.",
    briefing: `El trabajo **101** entrena un modelo de 7B en **2 nodos × 8 H100**, pero el Model FLOPs Utilization ronda el **26%**. La configuración de **train.sh** se copió de una pequeña prueba de depuración.

Lleva el trabajo a **≥ 55% de MFU**. Todas las opciones de la línea \`train.py\` valen: \`--micro-batch\`, \`--grad-accum\`, \`--overlap/--no-overlap\`, \`--ckpt/--no-ckpt\`, \`--workers\`, \`--precision\`, \`--zero\`, \`--tp\`.

Flujo: \`nano train.sh\` → guardar → \`scontrol requeue 101\` (vuelve a leer el script) → mira \`tail slurm-101.out\`. Busca errores de OOM y la marca "dataloader wait".`,
    objectives: ["El trabajo de 7B entrena con ≥ 55% de MFU", "…usando todavía ambos nodos (16 GPUs)"],
    hints: [
      "Tres cosas frenan este trabajo: micro-batches diminutos, sincronización de gradientes que no se solapa con el cómputo y recomputación innecesaria. Prueba primero `--overlap` y `--no-ckpt`.",
      "Después de eso el cuello de botella se mueve: el log muestra `dataloader wait`. Un solo worker no alcanza para 16 GPUs. Prueba `--workers 8`.",
      "Un `--micro-batch` mayor (2) y `--grad-accum 4` mantienen ocupados los tensor cores. Micro-batch 4 sin checkpointing se queda sin memoria. Revisa la línea de memoria por GPU.",
    ],
    debrief: `**El cuello de botella siempre se mueve.** Seguramente lo viste pasar de *comunicación* → *carga de datos* → *cómputo*:

- **Solapamiento**: DDP/FSDP pueden hacer all-reduce de los buckets de gradientes mientras el backward sigue corriendo. Sin eso, cada byte de sincronización es tiempo expuesto.
- **Checkpointing de activaciones**: cambia ~33% más de cómputo por memoria. Es esencial para modelos grandes y puro desperdicio cuando las activaciones ya caben.
- **Tamaño del micro-batch**: define el tamaño de las GEMM. Las GEMM pequeñas no saturan los tensor cores. La acumulación de gradientes te deja agrandar el batch *global* sin más memoria.
- **Pipeline de entrada**: cuando las GPUs ya son rápidas, la tokenización en CPU se vuelve el límite. Más workers, datos pre-tokenizados o precarga lo resuelven.

El MFU (del paper de PaLM) solo cuenta los FLOPs *útiles* del modelo (6 × parámetros × tokens), así que la recomputación nunca lo infla.`,
  },
  "power-cap": {
    title: "¿Cuántos watts?",
    tagline: "La instalación pide recortar 20% de potencia. Conserva al menos 85% del rendimiento.",
    briefing: `El equipo de instalaciones está al límite de temperatura y pide a cada inquilino que recorte la potencia de las GPUs. Tu trabajo de 7B bien afinado en **2 nodos × 8 H100** consume ~675 W por GPU.

Baja la **potencia media por GPU a ≤ 550 W** manteniendo **≥ 85% de los tokens/s actuales**.

Los límites de potencia se fijan por GPU con \`sudo nvidia-smi -pl <watts>\` en cada nodo. \`pdsh\` puede ejecutar un comando en varios nodos a la vez. Mira las gráficas de potencia y rendimiento mientras pruebas.`,
    objectives: ["Potencia media por GPU ≤ 550 W", "Rendimiento ≥ 85% de los tokens/s iniciales"],
    hints: [
      "Los límites son por nodo: `ssh node-1`, `sudo nvidia-smi -pl 550`, `exit`, y lo mismo en node-2. O `sudo pdsh -w node-[1-2] nvidia-smi -pl 550`.",
      "Limitar solo un nodo frena *todo* el trabajo, porque la GPU más lenta marca el ritmo, y casi no mueve el promedio. Limita ambos.",
      "Entre 500 y 550 W mantienes más del 85% del rendimiento. Si bajas demasiado (≤ 450 W) te quedas por debajo.",
    ],
    debrief: `**Limitar la potencia es la mejora de eficiencia más barata del centro de datos.**

La potencia dinámica de una GPU escala aproximadamente con *f·V²*, y el voltaje sigue a la frecuencia cerca del extremo superior de la curva. Así que el último ~10% de velocidad de reloj cuesta ~25% de la potencia. Además, bajo un límite solo se frena la parte de *cómputo* de cada paso. A la comunicación y la carga de datos no les importan los relojes del SM.

Tu resultado: aproximadamente 20% menos potencia por menos de 10% menos rendimiento. Eso es **más tokens por joule**, es decir menor costo y menos CO₂e por modelo entrenado. Muchos sitios entrenan al 70–85% del TDP justamente por esto.

**Mirada de operación responsable**: la energía es un recurso compartido. Reportar kWh y CO₂e por trabajo (mira el pie de la ejecución) ayuda a los equipos a tomar estas decisiones a conciencia.`,
  },
  cryptominer: {
    title: "Turno de noche",
    tagline: "Una GPU está ocupada sin ningún trabajo planificado. Investiga, contén y elimina la persistencia.",
    briefing: `El monitoreo disparó **GpuBusyWithoutJob** en **node-2**: una GPU está al máximo, pero Slurm dice que no hay nada asignado ahí. Este es un simulacro defensivo de respuesta a incidentes en un clúster simulado.

Contenlo como corresponde:
1. **Detén la carga no autorizada.**
2. **Cierra la puerta de entrada.** Algo en node-2 está expuesto a la red.
3. **Bloquea la cuenta comprometida.**
4. **Elimina la persistencia**, para que no vuelva sola.

El objetivo solo se cumple cuando la GPU sigue limpia durante **2 minutos**. Útil: \`ssh node-2\`, \`nvidia-smi\`, \`ps aux\`, \`ss -tnp\`, \`systemctl\`, \`journalctl -u <svc>\`, \`crontab -l -u <usuario>\`, \`sudo\`.`,
    objectives: ["Persistencia eliminada (sin entrada maliciosa en cron)", "Servidor Jupyter expuesto detenido", "Cuenta 'intern' bloqueada", "Ningún minero corriendo durante 2 minutos"],
    hints: [
      "`ssh node-2` y luego `nvidia-smi` muestra un proceso en la GPU 3 que no es `python train.py`. `ps aux` muestra de quién es.",
      "Si lo matas, vuelve. Revisa `sudo crontab -l -u intern`, y `ss -tlnp` para ver un servicio escuchando en 0.0.0.0. Luego `journalctl -u jupyter-intern`.",
      "`sudo crontab -r -u intern`, `sudo systemctl disable --now jupyter-intern`, `sudo usermod -L intern`, `sudo kill -9 <pid>`.",
    ],
    debrief: `**Qué pasó**: un practicante inició Jupyter con \`--ip=0.0.0.0\` y **sin token ni contraseña**. Cualquiera que pudiera llegar al puerto 8888 podía ejecutar código como \`intern\`. Alguien desde 203.0.113.77 lo hizo: subió un minero, agregó una **entrada de cron** para reiniciarlo y lo apuntó a una GPU fuera del control de Slurm.

**Por qué importó cada paso**
- *Matar el proceso* solo no basta: cron y el notebook abierto lo traen de vuelta.
- *Detener el servicio* cierra la entrada. *Bloquear la cuenta* impide reutilizar la identidad.
- *Eliminar la entrada de cron* quita la persistencia.

**Prevención en un clúster de GPU compartido**
- Nunca expongas notebooks directamente. Usa un túnel SSH o un gateway autenticado, y pon firewall a los nodos de cómputo.
- Haz que el acceso a GPU pase **por el planificador**: aislamiento de dispositivos con cgroups para que los procesos fuera de una asignación no puedan abrir \`/dev/nvidia*\`.
- Alerta cuando una *GPU esté ocupada sin trabajo*. La contabilidad por proceso de DCGM más el estado del planificador lo vuelven trivial.
- Mínimo privilegio, y logs de auditoría que realmente leas.

En un incidente real también **preservarías evidencia**, rotarías credenciales y avisarías a tu equipo de seguridad. Contener es el primer paso, no el final.`,
  },
  "fit-70b": {
    title: "Setenta mil millones de razones",
    tagline: "Un modelo de 70B en 32 GPUs: no cabe. Elige una estrategia de paralelismo que quepa y corra rápido.",
    briefing: `Tienes **4 nodos × 8 H100 (80 GB)** y un modelo de **70B parámetros** para entrenar. Con paralelismo de datos simple cada GPU necesitaría ~1.2 TB. Da OOM al instante.

Diseña una distribución en paralelo que **quepa en memoria** y alcance **≥ 35% de MFU** en las 32 GPUs. Opciones de \`train.py\`: \`--tp\` (paralelismo tensorial), \`--pp\` (paralelismo de pipeline), \`--zero 0-3\`, \`--micro-batch\`, \`--grad-accum\`, \`--ckpt\`.

Recuerda: *dp = 32 / (tp × pp)*, NVLink solo existe **dentro** de un nodo y las 80 capas deben repartirse por igual entre las etapas del pipeline.`,
    objectives: ["Un trabajo de 70B entrena en 32 GPUs sin OOM", "…con ≥ 35% de MFU"],
    hints: [
      "Lee la línea de OOM en `slurm-101.out`: separa la memoria en pesos, gradientes, optimizador y activaciones. El estado del optimizador es la parte más grande.",
      "ZeRO-3 en 32 GPUs cabe, pero hace all-gather de 140 GB de parámetros por InfiniBand dos veces por micro-batch. Pruébalo y mira el MFU. El paralelismo tensorial *dentro* del nodo (tp=8, NVLink) es la jugada clásica.",
      "`--tp 8 --pp 2 --zero 1` (dp=2) o `--tp 8 --pp 1 --zero 1` (dp=4) funcionan. No pongas tp por encima de 8, o el tráfico tensorial cruza InfiniBand.",
    ],
    debrief: `**Primero las cuentas de memoria, después la topología de red.**

- Adam en precisión mixta cuesta ~16 B/parámetro: 70B × 16 = 1.1 TB de estado *antes* de las activaciones. Algo tiene que repartirlo.
- **ZeRO / FSDP** reparte el estado del optimizador, los gradientes y (en la etapa 3) los parámetros entre los rangos de paralelismo de datos. La etapa 3 hace caber cualquier cosa, pero los parámetros deben **reunirse con all-gather en cada forward y backward**. Sobre una NIC de 400 Gb/s eso dominó tu paso.
- El **paralelismo tensorial** (estilo Megatron) divide cada matmul entre GPUs. Necesita ~4 all-reduce de activaciones *por capa*, así que pertenece a **NVLink dentro de un nodo**. tp=16 empujaría ese tráfico por InfiniBand.
- El **paralelismo de pipeline** divide la pila de capas. El tráfico es ligero, pero cuesta una *burbuja* de (pp−1)/(microbatches+pp−1). Más acumulación de gradientes la reduce.

La receta común, "TP dentro del nodo, PP entre unos pocos nodos, DP (+ZeRO-1) en el resto", sale directamente de la jerarquía de ancho de banda. Esa es la idea central del paralelismo 3D.`,
  },
  "pod-design": {
    title: "Construye el pod",
    tagline: "Especifica un pod de GPUs que entrene un modelo de 13B en dos semanas, dentro del presupuesto y la potencia disponible.",
    briefing: `Tu laboratorio consiguió fondos para preentrenar un **modelo de 13B con 300 mil millones de tokens**. Restricciones de finanzas e instalaciones:

- **Capex ≤ $2.0M** (GPUs, hosts, red)
- **Potencia de la instalación ≤ 60 kW**, incluida la refrigeración (PUE 1.3)
- **Tiempo de entrenamiento ≤ 14 días**

Elige la GPU, el número de nodos y la red. La estimación busca distribuciones de paralelismo (TP/PP/ZeRO/micro-batch) para cada diseño y reporta la mejor que cabe en memoria. Menos energía es mejor: es parte de tu puntuación.`,
    objectives: ["Capex ≤ $2.0M", "Potencia de la instalación ≤ 60 kW", "Entrena 13B × 300B tokens en ≤ 14 días"],
    hints: [
      "FLOPs totales ≈ 6 × 13e9 × 300e9 ≈ 2.3e22. Divide entre (GPUs × pico × ~55% de MFU) para una verificación rápida.",
      "Las A100 son baratas por GPU pero rinden ~1/3 de una H100. Cuenta cuántos nodos necesitarías y cuánto costaría.",
      "Prueba 5–6 nodos H100. Luego compara InfiniBand, RoCE y Ethernet de 100 GbE: la sincronización de gradientes en redes tipo TCP se nota en el tiempo.",
    ],
    debrief: `**La arquitectura es una optimización con restricciones**, y la restricción que manda va cambiando:

- **L40S**: barata, pero solo PCIe (sin NVLink) y con menos memoria por GPU, así que el paralelismo tensorial sufre y entrenar 13B tarda bastante más de dos semanas.
- **A100**: nodos asequibles, pero necesitarías ~10+ nodos para el plazo, y eso rompe el presupuesto.
- **H100 × 5–6 nodos**: cumple el plazo. **Ethernet de 100G** es más barata, pero la sincronización de gradientes se vuelve tiempo expuesto y no llegas. **RoCE 400G** es un ahorro legítimo frente a InfiniBand si está bien afinada.

**La energía también importa**: las GPUs más nuevas suelen ganar en *joules por token* aunque consuman más watts, porque terminan mucho antes. Reporta MWh y CO₂e en cada revisión de diseño.`,
  },
};
