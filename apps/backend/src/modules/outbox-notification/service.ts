import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AbstractNotificationProviderService } from "@medusajs/framework/utils";
import type { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types";

type Options = { dir?: string };

/**
 * Development email provider: instead of sending, saves each email as an HTML
 * file in apps/backend/.outbox so it can be opened in a browser.
 * Replace with a real provider (e.g. Resend) in medusa-config.ts for production.
 */
export default class OutboxNotificationService extends AbstractNotificationProviderService {
  static identifier = "outbox";
  private dir: string;
  private logger: Logger;

  constructor({ logger }: { logger: Logger }, options: Options) {
    super();
    this.logger = logger;
    this.dir = path.resolve(process.cwd(), options?.dir ?? ".outbox");
  }

  async send(n: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    await mkdir(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeTo = n.to.replace(/[^a-z0-9@._-]/gi, "_");
    const file = path.join(this.dir, `${stamp}_${n.template}_${safeTo}.html`);
    const subject = n.content?.subject ?? n.template;
    const header = `<!-- to: ${n.to} | subject: ${subject} | template: ${n.template} -->\n`;
    await writeFile(file, header + (n.content?.html ?? `<pre>${JSON.stringify(n.data, null, 2)}</pre>`), "utf8");
    this.logger.info(`[outbox] "${subject}" -> ${n.to} (${path.basename(file)})`);
    return { id: path.basename(file) };
  }
}
