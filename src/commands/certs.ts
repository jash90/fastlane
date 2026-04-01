import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs";
import { generateJWT, type AppleCredentials } from "../api/auth.js";
import { generateCSR, createCertificate, listCertificates, downloadCertificate, exportP12 } from "../api/certificates.js";
import type { CertificateType, CertificateInfo } from "../types.js";
import { loadCredentials } from "../config/credentials-store.js";
import { findP8Files } from "../config/p8.js";

export interface CertsCommandOptions {
  token?: string;
  type?: string;
  output?: string;
  force?: boolean;
  interactive?: boolean;
}

export interface CertsCommandResult {
  certificateId: string;
  p12Path?: string;
}

export async function runCertsCommand(
  options: CertsCommandOptions = {}
): Promise<CertsCommandResult> {
  const projectRoot = process.cwd();
  const home = process.env.HOME ?? "";

  let token = options.token;
  if (!token) {
    token = await resolveToken(projectRoot, home);
  }

  // Determine certificate type
  let certType: CertificateType;
  if (options.type === "development") {
    certType = "IOS_DEVELOPMENT";
  } else if (options.type === "distribution") {
    certType = "IOS_DISTRIBUTION";
  } else {
    const { selectedType } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedType",
        message: "Certificate type:",
        choices: [
          { name: "Distribution (App Store / Ad Hoc)", value: "IOS_DISTRIBUTION" },
          { name: "Development", value: "IOS_DEVELOPMENT" },
        ],
      },
    ]);
    certType = selectedType;
  }

  // List existing certificates
  const spinner = ora("Fetching existing certificates...").start();
  const existing = await listCertificates(token, certType);
  spinner.stop();

  const validCerts = existing.filter(
    (c) => new Date(c.expirationDate) > new Date()
  );

  let selectedCert: CertificateInfo | null = null;
  let privateKeyPem: string | undefined;

  if (validCerts.length > 0 && !options.force) {
    console.log(chalk.bold(`\nExisting ${certType} certificates:`));
    validCerts.forEach((c) => {
      const expDate = new Date(c.expirationDate).toLocaleDateString();
      console.log(chalk.gray(`  ${c.name} - expires ${expDate} (${c.serialNumber})`));
    });

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          ...validCerts.map((c) => ({
            name: `Use existing: ${c.name} (expires ${new Date(c.expirationDate).toLocaleDateString()})`,
            value: `use:${c.id}`,
          })),
          { name: "Create a new certificate", value: "create" },
        ],
      },
    ]);

    if (action !== "create") {
      const certId = action.replace("use:", "");
      selectedCert = validCerts.find((c) => c.id === certId) ?? null;
    }
  }

  if (!selectedCert) {
    // Generate CSR and create certificate
    const csrSpinner = ora("Generating CSR and creating certificate...").start();
    const csr = generateCSR();
    privateKeyPem = csr.privateKeyPem;
    selectedCert = await createCertificate(token, csr.csrBase64, certType);
    csrSpinner.succeed(`Certificate created: ${selectedCert.name}`);
  }

  // Download .cer
  const outputDir = options.output ?? path.join(projectRoot, "certs");
  const cerPath = downloadCertificate(selectedCert, outputDir);
  console.log(chalk.green(`  .cer saved: ${cerPath}`));

  // Export .p12 if we have the private key
  let p12Path: string | undefined;
  if (privateKeyPem) {
    const { p12Password } = await inquirer.prompt([
      {
        type: "password",
        name: "p12Password",
        message: "Password for .p12 export:",
        mask: "*",
        validate: (v) => v.length >= 4 || "Min. 4 characters",
      },
    ]);

    p12Path = path.join(outputDir, `${selectedCert.certificateType}_${selectedCert.serialNumber}.p12`);
    exportP12(privateKeyPem, cerPath, p12Path, p12Password);
    console.log(chalk.green(`  .p12 saved: ${p12Path}`));
  } else {
    console.log(
      chalk.yellow(
        "  Note: No private key available for .p12 export (using existing certificate)"
      )
    );
  }

  console.log(chalk.green(`\nCertificate ready: ${selectedCert.id}`));

  // Cleanup downloaded files
  try {
    if (fs.existsSync(cerPath)) fs.unlinkSync(cerPath);
    if (p12Path && fs.existsSync(p12Path)) fs.unlinkSync(p12Path);
    // Remove certs dir if empty
    if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length === 0) {
      fs.rmdirSync(outputDir);
    }
  } catch {}

  return {
    certificateId: selectedCert.id,
    p12Path,
  };
}

async function resolveToken(projectRoot: string, home: string): Promise<string> {
  const saved = loadCredentials();

  if (saved?.keyId && saved?.issuerId) {
    const p8Files = findP8Files(projectRoot, home);
    if (p8Files.length > 0) {
      const p8Content = fs.readFileSync(p8Files[0], "utf8");
      const p8Base64 = Buffer.from(p8Content).toString("base64");
      return generateJWT({ keyId: saved.keyId, issuerId: saved.issuerId, p8Base64 });
    }
  }

  const creds = await inquirer.prompt<AppleCredentials>([
    { type: "input", name: "keyId", message: "Key ID:", default: saved?.keyId, validate: (v) => !!v.trim() || "Required" },
    { type: "input", name: "issuerId", message: "Issuer ID:", default: saved?.issuerId, validate: (v) => !!v.trim() || "Required" },
    { type: "input", name: "p8Base64", message: "Base64-encoded .p8 key:", validate: (v) => !!v.trim() || "Required" },
  ]);

  return generateJWT(creds);
}
