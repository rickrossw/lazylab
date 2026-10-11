import type { Metadata } from "next";
import { LabClient } from "@/components/LabClient";

export const metadata: Metadata = {
  title: "Lab",
  description: "A free-play simulated GPU cluster: submit Slurm jobs, inspect GPUs with nvidia-smi and DCGM, inject faults and watch what breaks.",
};

export default function LabPage() {
  return (
    <div className="container" style={{ padding: "24px 20px" }}>
      <div className="row" style={{ marginBottom: 14, alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Sandbox</div>
          <h1 style={{ fontSize: "2rem", marginBottom: 4 }}>The Lab</h1>
          <p className="muted" style={{ margin: 0 }}>
            A whole simulated cluster to play with. Submit jobs, break hardware, read the logs. Nothing here can hurt anything real.
          </p>
        </div>
      </div>
      <LabClient />
    </div>
  );
}
