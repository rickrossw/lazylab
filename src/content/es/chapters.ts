import type { TrackId } from "@/missions";

export const CHAPTERS_ES: Record<TrackId, { title: string; kicker: string; intro: string }> = {
  architecture: {
    title: "Anatomía de un clúster de GPU",
    kicker: "De un streaming multiprocessor a una red de mil GPUs",
    intro:
      "Antes de poder operar, afinar o proteger un clúster necesitas un modelo mental de lo que tiene dentro. Este capítulo sube por la jerarquía: la GPU y sus SM, la memoria que los alimenta, los enlaces entre GPUs de un servidor y la red entre servidores. Ten una idea en mente todo el tiempo: cada nivel es aproximadamente un orden de magnitud más lento que el de abajo, y casi todas las decisiones de diseño se ubican en esa escalera.",
  },
  running: {
    title: "Ejecutar trabajos",
    kicker: "Drivers, planificadores y la plomería que lleva el trabajo a las GPUs",
    intro:
      "Un clúster solo sirve si la gente puede ponerle trabajo de forma confiable y justa. Este capítulo cubre la pila de software desde el driver del kernel hasta el framework, el planificador por lotes que usan la mayoría de los clústeres de HPC e IA, la biblioteca de comunicación que hace posible el entrenamiento con varias GPUs y los hábitos (checkpoints, fair share) que mantienen sana una máquina compartida.",
  },
  monitoring: {
    title: "Vigilar la flota",
    kicker: "Telemetría, códigos de error y encontrar la única pieza rota",
    intro:
      "A escala, siempre hay algo fallando. Este capítulo trata de verlo: qué te pueden decir nvidia-smi y DCGM, cómo reporta fallas el driver mediante códigos Xid, qué significan los errores de memoria y cómo una sola GPU limitada puede frenar en silencio a otras mil.",
  },
  optimization: {
    title: "Entrenar más rápido",
    kicker: "Kernels, precisión y el zoológico del paralelismo",
    intro:
      "Este es el capítulo más largo porque es donde está el dinero. Empezamos dentro de una sola GPU (warps, acceso a memoria, tensor cores, precisión) y luego escalamos: paralelismo de datos, solapamiento, trucos de memoria como checkpointing y ZeRO, y por último paralelismo tensorial y de pipeline, las piezas del paralelismo 3D.",
  },
  performance: {
    title: "Medir y escalar",
    kicker: "Rooflines, MFU, colectivas y el precio de un joule",
    intro:
      "¿Qué tan rápido debería ir esto? Este capítulo te da las varas de medir: el roofline para kernels, el MFU para entrenamientos, el modelo α-β para colectivas y Amdahl para el escalado. Termina con el costo más fácil de ignorar, la energía, y la palanca más simple para reducirla: limitar la potencia.",
  },
  security: {
    title: "Proteger GPUs compartidas",
    kicker: "Aislamiento, servicios expuestos y respuesta a incidentes",
    intro:
      "Los clústeres de GPU son compartidos, valiosos y están llenos de código que nadie auditó del todo, lo que los vuelve blancos atractivos. Este capítulo cubre cómo se comparten y aíslan las GPUs, cómo obtienen acceso los contenedores a los dispositivos y cómo ocurre y se contiene el abuso más común (minería no autorizada a través de un notebook expuesto). Todo aquí es defensivo.",
  },
};

export const TRACKS_ES: Record<TrackId, { name: string; blurb: string }> = {
  architecture: { name: "Arquitectura", blurb: "GPUs, interconexiones, topologías y sus compromisos." },
  running: { name: "Operación", blurb: "Planificadores, trabajos por lotes, contenedores y la pila CUDA." },
  optimization: { name: "Optimización", blurb: "Paralelismo, memoria, precisión y mantener alimentados los tensor cores." },
  monitoring: { name: "Monitoreo", blurb: "Telemetría, errores Xid, chequeos de salud y encontrar lo que está roto." },
  performance: { name: "Rendimiento", blurb: "Escalado, ancho de banda, potencia y más trabajo por joule." },
  security: { name: "Seguridad", blurb: "Aislamiento multi-inquilino, servicios expuestos y respuesta a incidentes." },
};
