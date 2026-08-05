import type { AppLogger } from "./logger.js";

type ShutdownTask = () => Promise<void> | void;

interface ShutdownRegistration {
  name: string;
  task: ShutdownTask;
}

export class ShutdownManager {
  private readonly tasks: ShutdownRegistration[] = [];
  private shuttingDown = false;
  private uncaughtHandler?: (error: Error) => void;
  private rejectionHandler?: (reason: unknown) => void;
  private readonly logger: AppLogger;
  private readonly timeoutMs: number;

  constructor(logger: AppLogger, timeoutMs: number) {
    this.logger = logger;
    this.timeoutMs = timeoutMs;
  }

  register(name: string, task: ShutdownTask): void {
    this.tasks.push({ name, task });
  }

  installSignalHandlers(): void {
    const handle = (signal: NodeJS.Signals): void => {
      this.logger.info({ signal }, "Sinal de encerramento recebido. Iniciando shutdown gracioso.");
      void this.shutdown(signal).then((code) => {
        process.exit(code);
      });
    };
    process.once("SIGTERM", handle);
    process.once("SIGINT", handle);

    this.uncaughtHandler = (error: Error): void => {
      this.logger.fatal({ err: error }, "Exceção não capturada.");
      void this.shutdown("uncaughtException").then((code) => {
        process.exit(code === 0 ? 1 : code);
      });
    };
    this.rejectionHandler = (reason: unknown): void => {
      this.logger.fatal({ reason: safeReason(reason) }, "Promise rejeitada sem tratamento.");
      void this.shutdown("unhandledRejection").then((code) => {
        process.exit(code === 0 ? 1 : code);
      });
    };
    process.on("uncaughtException", this.uncaughtHandler);
    process.on("unhandledRejection", this.rejectionHandler);
  }

  async shutdown(reason: string): Promise<number> {
    if (this.shuttingDown) return 0;
    this.shuttingDown = true;
    const started = Date.now();
    let failures = 0;
    for (const { name, task } of this.tasks.reverse()) {
      const remaining = this.timeoutMs - (Date.now() - started);
      if (remaining <= 0) {
        this.logger.warn(
          { task: name },
          "Timeout de shutdown excedido; tarefas restantes ignoradas.",
        );
        failures += 1;
        break;
      }
      try {
        await withTimeout(Promise.resolve(task()), remaining, name);
        this.logger.debug({ task: name }, "Tarefa de shutdown concluída.");
      } catch (error) {
        failures += 1;
        this.logger.error(
          { task: name, reason: safeReason(error) },
          "Falha em tarefa de shutdown.",
        );
      }
    }
    this.logger.info(
      { reason, durationMs: Date.now() - started, failures },
      "Shutdown finalizado.",
    );
    return failures === 0 ? 0 : 1;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout na tarefa de shutdown: ${label}`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function safeReason(reason: unknown): unknown {
  if (reason instanceof Error) return reason;
  return String(reason);
}
