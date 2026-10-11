export interface Source {
  title: string;
  url: string;
  note?: string;
}

export const SOURCES = {
  prace: { title: "PRACE Best Practice Guide – GPGPU", url: "https://prace-ri.eu/wp-content/uploads/Best-Practice-Guide_GPGPU.pdf", note: "GPU programming and tuning practice for HPC" },
  dtbook: { title: "Distributed Training (T. Tsugriy)", url: "https://ttsugriy.github.io/distributed-training-book/", note: "parallelism strategies, collectives, memory" },
  modal: { title: "Modal GPU Glossary", url: "https://modal.com/gpu-glossary", note: "hardware and software vocabulary" },
  grcuda: { title: "NVIDIA grCUDA", url: "https://github.com/NVIDIA/grcuda", note: "polyglot GPU access and asynchronous kernel scheduling" },
  ogkm: { title: "NVIDIA open-gpu-kernel-modules", url: "https://github.com/NVIDIA/open-gpu-kernel-modules", note: "open-source Linux GPU kernel driver" },
  cudaGuide: { title: "CUDA C++ Programming Guide", url: "https://docs.nvidia.com/cuda/cuda-c-programming-guide/" },
  cudaBest: { title: "CUDA C++ Best Practices Guide", url: "https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/" },
  xid: { title: "NVIDIA Xid Errors", url: "https://docs.nvidia.com/deploy/xid-errors/" },
  dcgm: { title: "NVIDIA DCGM documentation", url: "https://docs.nvidia.com/datacenter/dcgm/latest/" },
  nvsmi: { title: "nvidia-smi documentation", url: "https://docs.nvidia.com/deploy/nvidia-smi/" },
  slurm: { title: "Slurm documentation", url: "https://slurm.schedmd.com/documentation.html" },
  nccl: { title: "NCCL User Guide", url: "https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/" },
  megatron: { title: "Megatron-LM (Shoeybi et al., 2019)", url: "https://arxiv.org/abs/1909.08053" },
  zero: { title: "ZeRO (Rajbhandari et al., 2020)", url: "https://arxiv.org/abs/1910.02054" },
  actRecompute: { title: "Reducing Activation Recomputation (Korthikanti et al., 2022)", url: "https://arxiv.org/abs/2205.05198" },
  palm: { title: "PaLM: MFU definition (Chowdhery et al., 2022)", url: "https://arxiv.org/abs/2204.02311" },
  roofline: { title: "Roofline model (Williams, Waterman & Patterson, 2009)", url: "https://doi.org/10.1145/1498765.1498785" },
  gpipe: { title: "GPipe (Huang et al., 2019)", url: "https://arxiv.org/abs/1811.06965" },
  mixed: { title: "Mixed Precision Training (Micikevicius et al., 2018)", url: "https://arxiv.org/abs/1710.03740" },
  mig: { title: "NVIDIA MIG User Guide", url: "https://docs.nvidia.com/datacenter/tesla/mig-user-guide/" },
  gpuOperator: { title: "NVIDIA GPU Operator", url: "https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/" },
  containerToolkit: { title: "NVIDIA Container Toolkit", url: "https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/" },
  jupyterSec: { title: "Jupyter Server security", url: "https://jupyter-server.readthedocs.io/en/latest/operators/security.html" },
  patterson: { title: "Carbon Emissions and Large Neural Network Training (Patterson et al., 2021)", url: "https://arxiv.org/abs/2104.10350" },
  mlco2: { title: "Quantifying the Carbon Emissions of ML (Lacoste et al., 2019)", url: "https://arxiv.org/abs/1910.09700" },
  h100: { title: "NVIDIA H100 Tensor Core GPU", url: "https://www.nvidia.com/en-us/data-center/h100/" },
} satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
