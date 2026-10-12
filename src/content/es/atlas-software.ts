import type { AtlasText } from "./types";

export const SOFTWARE_ES: Record<string, AtlasText> = {
  "cuda-stack": {
    title: "La pila de software CUDA",
    summary: "Driver del kernel → driver de usuario → runtime de CUDA → bibliotecas → frameworks. En cada unión puede haber incompatibilidades de versión.",
    body: `De abajo hacia arriba:

1. **Módulo del kernel** (\`nvidia.ko\` y compañía). Controla el hardware, la gestión de memoria (incluida Unified Memory / UVM), las interrupciones y el reporte de errores. NVIDIA publica una versión de **código abierto**, *open-gpu-kernel-modules*, la predeterminada para Turing y posteriores. Los mensajes [[xid-errors|Xid]] que lees en \`dmesg\` vienen de aquí.
2. **Driver de modo usuario** (\`libcuda.so\`): la *driver API* de CUDA, incluida con el driver.
3. **Runtime y toolkit de CUDA** (\`libcudart\`, \`nvcc\`): contra lo que compilan las aplicaciones.
4. **Bibliotecas**: cuBLAS, cuDNN, [[nccl|NCCL]], CUTLASS.
5. **Frameworks**: PyTorch, JAX y herramientas de más alto nivel.

**Regla de compatibilidad**: un driver más nuevo ejecuta runtimes de CUDA más viejos, pero no al revés. \`nvidia-smi\` muestra la versión del driver y la versión *máxima* de CUDA que soporta. Los contenedores traen su propio runtime pero deben usar el driver del host, inyectado por el NVIDIA Container Toolkit. Ver [[containers-and-gpus|contenedores y GPUs]].`,
  },
  "cuda-streams": {
    title: "CUDA streams y ejecución asíncrona",
    summary: "Colas de trabajo de GPU que permiten que copias, kernels y comunicación se solapen en lugar de esperarse.",
    body: `Un **stream** es una cola ordenada de operaciones de GPU. El trabajo en streams distintos puede correr en paralelo: una copia host→dispositivo en uno, un kernel en otro, una colectiva de NCCL en un tercero. Los **eventos** expresan dependencias entre streams sin bloquear la CPU.

Este es el mecanismo detrás de cada optimización de "solapamiento":
- El all-reduce de gradientes que se solapa con el backward en [[data-parallelism|DDP]] usa un stream de comunicación aparte.
- Precargar el siguiente batch mientras se calcula el actual (ver [[input-pipeline|pipeline de entrada]]).
- ZeRO-3/FSDP precargando los parámetros de la siguiente capa (ver [[zero-fsdp|ZeRO y FSDP]]).

Proyectos como **grCUDA** van más lejos. Construyen el grafo de dependencias a partir de los datos que toca cada kernel y programan kernels independientes en streams separados automáticamente, así los programas políglotas obtienen concurrencia sin escribir código de streams a mano.

*Trampa*: cualquier sincronización implícita (\`cudaDeviceSynchronize\`, \`.item()\` en PyTorch, copias desde memoria paginable) colapsa tu solapamiento cuidadosamente construido en ejecución serial.`,
  },
  nccl: {
    title: "NCCL",
    summary: "La biblioteca de comunicación colectiva de NVIDIA: all-reduce, all-gather y demás, conscientes de la topología, sobre NVLink, PCIe y RDMA.",
    body: `NCCL ("nickel") implementa las colectivas de las que depende el entrenamiento distribuido: all-reduce, all-gather, reduce-scatter, broadcast y send/recv. Descubre la topología (NVLink, NVSwitch, PCIe, NIC) y construye **anillos** y **árboles** para aprovecharla. Ver [[all-reduce]].

**Variables de entorno que conviene conocer**
- \`NCCL_DEBUG=INFO\` imprime el transporte y los canales elegidos. Léelo.
- \`NCCL_IB_DISABLE=1\` fuerza sockets TCP en lugar de InfiniBand. Útil en una laptop y un desastre en producción.
- \`NCCL_SOCKET_IFNAME\` / \`NCCL_IB_HCA\` eligen las interfaces.

**Diagnóstico**
- \`all_reduce_perf\` de *nccl-tests* mide el *bus bandwidth* alcanzable. Córrelo en nodos libres para detectar enlaces malos antes que los usuarios.
- Las colectivas colgadas terminan con un **watchdog timeout** de PyTorch. La causa suele ser un rango malo: un enlace caído, una GPU perdida o un [[stragglers|straggler]] que dejó de responder.`,
  },
  slurm: {
    title: "Slurm",
    summary: "El planificador por lotes que corre en la mayoría de los clústeres de HPC y en muchos de IA: particiones, trabajos, asignaciones y estados de nodo.",
    body: `Slurm convierte un montón de servidores en una máquina compartida. Conceptos clave:

- **Particiones**: grupos de nodos con nombre y límites (\`sinfo\` las lista).
- **Trabajos**: se envían con \`sbatch script.sh\`. Las líneas \`#SBATCH\` del script piden recursos: \`--nodes\`, \`--gpus-per-node\`, \`--time\`, \`--partition\`.
- **Asignación**: el planificador elige nodos (backfill, prioridad, [[fair-share]]) y ejecuta el script en el primero. \`srun\` lanza tareas en el resto.
- **Estados de nodo**: \`idle\`, \`alloc\`, \`drain\` (termina lo que corre, no acepta trabajo nuevo) y \`down\`.

**Comandos diarios del operador**
\`\`\`
squeue --me                       # qué corre / qué espera y por qué
sacct                             # historial con códigos de salida
scontrol show job <id>            # todo sobre un trabajo
scontrol update NodeName=node-3 State=DRAIN Reason="gpu5 fan"
sinfo -R                          # por qué hay nodos en drain
scontrol requeue <id>             # reiniciar un trabajo (desde su checkpoint)
\`\`\`
Hacer drain con un motivo claro es la forma educada de decir "este hardware es sospechoso" sin matar el trabajo de nadie.`,
  },
  "kubernetes-gpu": {
    title: "Kubernetes y el GPU Operator",
    summary: "Cargas de GPU en Kubernetes: device plugins, el GPU Operator, perfiles MIG y gang scheduling.",
    body: `Kubernetes no sabe nada de GPUs por defecto. El **device plugin de NVIDIA** anuncia \`nvidia.com/gpu\` como recurso planificable. El **GPU Operator** instala y gestiona toda la pila como contenedores: driver, container toolkit, device plugin, [[dcgm|DCGM exporter]] y MIG manager.

**Diferencias con [[slurm]] que importan para entrenar**
- Kubernetes planifica *pods* de uno en uno. El entrenamiento distribuido necesita **gang scheduling** (todo o nada), que aportan complementos como Kueue o Volcano.
- La conciencia de topología (mismo rack, mismo dominio NVLink) requiere configuración extra.
- Brilla en flotas mixtas: servicios de inferencia, notebooks y CI junto a trabajos por lotes, a menudo en slices [[mig|MIG]].

Muchas organizaciones usan ambos: Slurm para el entrenamiento grande y Kubernetes para todo lo demás, a veces sobre el mismo hardware.`,
  },
  "containers-and-gpus": {
    title: "Contenedores y GPUs",
    summary: "Cómo acceden los contenedores a las GPUs: el driver del host, los nodos de dispositivo inyectados y el NVIDIA Container Toolkit.",
    body: `Una imagen de contenedor trae el *runtime* de CUDA y las bibliotecas, pero el *driver* de la GPU debe venir del host (es un módulo del kernel). El **NVIDIA Container Toolkit** une ambos. Al iniciar, monta las bibliotecas de espacio de usuario del driver y los nodos de dispositivo \`/dev/nvidia*\` dentro del contenedor.

**Reglas prácticas**
- Fija las imágenes a una versión de CUDA que el driver del host soporte (ver [[cuda-stack|pila CUDA]]).
- Los sitios de HPC suelen usar **Enroot/Pyxis** o **Apptainer** con Slurm. Ejecutan imágenes sin privilegios, una gran ventaja de seguridad.
- Nunca ejecutes contenedores de entrenamiento con \`--privileged\`. El runtime debe dar acceso a dispositivos de forma acotada.

**Ángulo de seguridad**: los nodos de dispositivo *son* la GPU. Cualquier cosa que pueda abrir \`/dev/nvidia*\` fuera del control del planificador puede usar la GPU. Así es exactamente como un minero no autorizado se esconde a plena vista. Ver [[cryptojacking]] y [[multi-tenancy|multi-tenencia]].`,
  },
};
