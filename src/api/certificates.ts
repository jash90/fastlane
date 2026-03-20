import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { ascFetch } from "./auth.js";
import type { CertificateInfo, CertificateType } from "../types.js";

export interface CSRResult {
  csrBase64: string;
  privateKeyPem: string;
}

export function generateCSR(): CSRResult {
  const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "fastlane-csr-"));
  const keyPath = path.join(tmpDir, "key.pem");
  const csrPath = path.join(tmpDir, "csr.pem");

  try {
    execSync(
      `openssl ecparam -genkey -name prime256v1 -noout -out "${keyPath}"`,
      { stdio: "pipe" }
    );
    execSync(
      `openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "/CN=Fastlane CLI/O=Dev/C=US"`,
      { stdio: "pipe" }
    );

    const privateKeyPem = fs.readFileSync(keyPath, "utf8");
    const csrPem = fs.readFileSync(csrPath, "utf8");
    const csrBase64 = Buffer.from(csrPem).toString("base64");

    return { csrBase64, privateKeyPem };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function createCertificate(
  token: string,
  csrBase64: string,
  type: CertificateType
): Promise<CertificateInfo> {
  const data = await ascFetch<any>(token, "certificates", {
    method: "POST",
    body: {
      data: {
        type: "certificates",
        attributes: {
          certificateType: type,
          csrContent: csrBase64,
        },
      },
    },
  });

  const c = data.data;
  return {
    id: c.id,
    name: c.attributes.name,
    certificateType: c.attributes.certificateType,
    expirationDate: c.attributes.expirationDate,
    serialNumber: c.attributes.serialNumber,
    certificateContent: c.attributes.certificateContent,
  };
}

export async function listCertificates(
  token: string,
  filterType?: CertificateType
): Promise<CertificateInfo[]> {
  const endpoint = filterType
    ? `certificates?filter[certificateType]=${filterType}`
    : "certificates";

  const data = await ascFetch<any>(token, endpoint);

  return (data.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.attributes.name,
    certificateType: c.attributes.certificateType,
    expirationDate: c.attributes.expirationDate,
    serialNumber: c.attributes.serialNumber,
    certificateContent: c.attributes.certificateContent,
  }));
}

export function downloadCertificate(
  certInfo: CertificateInfo,
  outputDir: string
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `${certInfo.certificateType}_${certInfo.serialNumber}.cer`;
  const outputPath = path.join(outputDir, fileName);
  const certData = Buffer.from(certInfo.certificateContent, "base64");
  fs.writeFileSync(outputPath, certData);

  return outputPath;
}

export function exportP12(
  privateKeyPem: string,
  cerPath: string,
  outputPath: string,
  password: string
): string {
  const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "fastlane-p12-"));
  const keyPath = path.join(tmpDir, "key.pem");
  const pemCertPath = path.join(tmpDir, "cert.pem");

  try {
    fs.writeFileSync(keyPath, privateKeyPem, { mode: 0o600 });

    // Convert DER (.cer) to PEM
    execSync(
      `openssl x509 -inform DER -in "${cerPath}" -out "${pemCertPath}"`,
      { stdio: "pipe" }
    );

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    execSync(
      `openssl pkcs12 -export -out "${outputPath}" -inkey "${keyPath}" -in "${pemCertPath}" -password "pass:${password}"`,
      { stdio: "pipe" }
    );

    return outputPath;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
