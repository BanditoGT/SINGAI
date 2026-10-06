

from __future__ import annotations

import os
import getpass
import json
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"
APP_URL = "http://localhost:5173"
APP_HEALTH_URL = "http://127.0.0.1:5173"
SERVICES = {
    "PERFIL": ("servicios/perfil/codigo/server.mjs", "http://localhost:4101/health"),
    "CORREO": ("servicios/correo/codigo/server.mjs", "http://localhost:4102/health"),
    "API": ("servicios/nucleo/codigo/server.mjs", "http://localhost:4100/api/health"),
}
REQUIRED_PORTS = (4100, 4101, 4102, 5173)
COLORS = {
    "WEB": "\033[96m",
    "API": "\033[92m",
    "PERFIL": "\033[95m",
    "CORREO": "\033[93m",
    "INFO": "\033[94m",
    "ERROR": "\033[91m",
}
RESET = "\033[0m"


def configure_console() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if os.name == "nt":
        os.system("")  # Habilita secuencias ANSI en terminales modernas de Windows.


def log(message: str, source: str = "INFO") -> None:
    color = COLORS.get(source, "")
    print(f"{color}[{source:^7}]{RESET} {message}", flush=True)


def find_node() -> Path | None:
    configured = os.environ.get("SENALAB_NODE")
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured))
    system_node = shutil.which("node")
    if system_node:
        candidates.append(Path(system_node))
    candidates.append(
        Path.home()
        / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
    )
    candidates.extend(
        Path.home().glob(".cache/codex-runtimes/*/dependencies/node/bin/node.exe")
    )
    return next((path.resolve() for path in candidates if path.is_file()), None)


def find_pnpm(node: Path) -> list[str] | None:
    configured = os.environ.get("SENALAB_PNPM")
    executable = configured or shutil.which("pnpm") or shutil.which("pnpm.cmd")
    if executable:
        path = str(Path(executable).resolve())
        return ["cmd.exe", "/d", "/c", path] if path.lower().endswith(".cmd") else [path]
    bundled = list(
        Path.home().glob(
            ".cache/codex-runtimes/*/dependencies/node/node_modules/pnpm/bin/pnpm.mjs"
        )
    )
    return [str(node), str(bundled[0].resolve())] if bundled else None


def dependencies_ready() -> bool:
    required = [
        ROOT / "aplicaciones/interfaz/node_modules/vite/bin/vite.js",
        ROOT / "servicios/nucleo/node_modules/express",
        ROOT / "servicios/perfil/node_modules/express",
        ROOT / "servicios/correo/node_modules/nodemailer",
    ]
    return all(path.exists() for path in required)


def read_env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_FILE.exists():
        return values
    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                value = value.strip('"')
        else:
            value = value.strip("'")
        values[key.strip()] = value
    return values


def configure_email() -> None:
    """Configura un remitente SMTP sin limitar el proveedor del destinatario."""
    values = read_env_file()
    if values.get("SMTP_HOST") and values.get("SMTP_USER") and values.get("SMTP_PASS"):
        return
    if os.environ.get("SINGAI_SKIP_EMAIL_SETUP") == "1" or not sys.stdin.isatty():
        return

    print("\n  Configuración de correo")
    print("  SingAI necesita una cuenta remitente para entregar enlaces reales.")
    print("  Puede enviar a Gmail, Hotmail, Outlook, Yahoo o cualquier correo válido.")
    answer = input("  ¿Deseas configurar el envío de correos ahora? [s/N]: ").strip().lower()
    if answer not in {"s", "si", "sí", "y", "yes"}:
        log("Correo sin configurar: los enlaces se guardarán en datos/bandeja-salida.", "CORREO")
        return

    print("\n  1. Gmail / Google Workspace")
    print("  2. Mailjet (útil para remitentes Proton y otros correos)")
    print("  3. Otro proveedor con acceso SMTP")
    provider = input("  Selecciona el proveedor [1]: ").strip() or "1"
    if provider not in {"1", "2", "3"}:
        raise RuntimeError("Selecciona 1 para Gmail, 2 para Mailjet o 3 para otro SMTP.")

    sender_email = input("  Dirección que aparecerá como remitente: ").strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", sender_email):
        raise RuntimeError("Escribe una dirección de correo remitente válida.")

    if provider == "1":
        smtp_host, smtp_port, smtp_secure = "smtp.gmail.com", "465", "true"
        smtp_user = sender_email
        print("  Usa una contraseña de aplicación, no la contraseña normal de Gmail.")
        print("  Puedes crearla en: https://myaccount.google.com/apppasswords")
        while True:
            entered_password = getpass.getpass(
                "  Contraseña de aplicación de Google (16 caracteres, no se mostrará): "
            )
            smtp_password = re.sub(r"[\s-]+", "", entered_password)
            if len(smtp_password) == 16:
                break
            print(
                f"  No es válida: se detectaron {len(smtp_password)} caracteres "
                "(deben ser 16). Vuelve a intentarlo."
            )
    elif provider == "2":
        smtp_host, smtp_port, smtp_secure = "in-v3.mailjet.com", "587", "false"
        print("  En Mailjet abre Account Settings > SMTP and SEND API settings.")
        smtp_user = input("  API Key de Mailjet (usuario SMTP): ").strip()
        smtp_password = getpass.getpass(
            "  Secret Key de Mailjet (no se mostrará): "
        ).strip()
        if not smtp_user or not smtp_password:
            raise RuntimeError("La API Key y la Secret Key de Mailjet son obligatorias.")
    else:
        smtp_host = input("  Servidor SMTP (ejemplo: smtp.proveedor.com): ").strip()
        smtp_port = input("  Puerto SMTP [587]: ").strip() or "587"
        secure_answer = input("  ¿Usa SSL directo? [s/N]: ").strip().lower()
        smtp_secure = "true" if secure_answer in {"s", "si", "sí", "y", "yes"} else "false"
        if not smtp_host or not smtp_port.isdigit() or not 1 <= int(smtp_port) <= 65535:
            raise RuntimeError("El servidor o el puerto SMTP no son válidos.")
        smtp_user = input(f"  Usuario SMTP [{sender_email}]: ").strip() or sender_email
        smtp_password = getpass.getpass(
            "  Contraseña o clave de aplicación SMTP (no se mostrará): "
        )
        if not smtp_password:
            raise RuntimeError("La clave SMTP no puede estar vacía.")

    values.update(
        {
            "SMTP_HOST": smtp_host,
            "SMTP_PORT": smtp_port,
            "SMTP_SECURE": smtp_secure,
            "SMTP_USER": smtp_user,
            "SMTP_PASS": smtp_password,
            "MAIL_FROM": f"SingAI <{sender_email}>",
            "JWT_SECRET": values.get("JWT_SECRET") or secrets.token_urlsafe(48),
            "SERVICE_KEY": values.get("SERVICE_KEY") or secrets.token_urlsafe(40),
            "PUBLIC_APP_URL": values.get("PUBLIC_APP_URL") or APP_URL,
        }
    )
    preferred_order = [
        "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS",
        "MAIL_FROM", "JWT_SECRET", "SERVICE_KEY", "PUBLIC_APP_URL",
    ]
    remaining = [key for key in values if key not in preferred_order]
    lines = [
        f"{key}={json.dumps(str(values[key]), ensure_ascii=False)}"
        for key in [*preferred_order, *remaining]
        if values.get(key)
    ]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log("Remitente guardado en .env. Las credenciales se comprobarán al iniciar.", "CORREO")


def run_setup(node: Path) -> None:
    if not dependencies_ready():
        pnpm = find_pnpm(node)
        if not pnpm:
            raise RuntimeError(
                "Faltan las dependencias y no se encontró pnpm. Instala Node.js y "
                "ejecuta: corepack enable"
            )
        log("Primera ejecución: instalando dependencias…")
        subprocess.run([*pnpm, "install"], cwd=ROOT, check=True)

    log("Actualizando el catálogo de lecciones…")
    subprocess.run(
        [str(node), str(ROOT / "herramientas/construir-catalogo.mjs")],
        cwd=ROOT,
        check=True,
    )


def occupied_ports() -> list[int]:
    occupied: list[int] = []
    for port in REQUIRED_PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(0.25)
            if connection.connect_ex(("127.0.0.1", port)) == 0:
                occupied.append(port)
    return occupied


def report_mail_mode() -> None:
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open("http://127.0.0.1:4102/health", timeout=2) as response:
            mode = json.loads(response.read().decode("utf-8")).get("delivery")
        if mode == "local-outbox":
            log(
                "Modo local: los enlaces se guardarán en datos/bandeja-salida. "
                "Configura un remitente SMTP para enviarlos a cualquier correo.",
                "CORREO",
            )
        elif mode == "smtp-error":
            log(
                "El proveedor de correo rechazó las credenciales. Los enlaces se guardarán en "
                "datos/bandeja-salida; corrige o elimina .env para configurarlo de nuevo.",
                "CORREO",
            )
        else:
            log("Envío SMTP habilitado; los enlaces se enviarán por correo.", "CORREO")
    except (OSError, ValueError, urllib.error.URLError):
        log("No fue posible consultar el modo de entrega de correo.", "CORREO")


def relay_output(process: subprocess.Popen[str], source: str) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        clean = line.rstrip()
        if clean:
            log(clean, source)


def start_process(
    command: list[str],
    source: str,
    node_env: dict[str, str],
    working_directory: Path = ROOT,
) -> subprocess.Popen[str]:
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    process = subprocess.Popen(
        command,
        cwd=working_directory,
        env=node_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=flags,
    )
    threading.Thread(
        target=relay_output, args=(process, source), daemon=True
    ).start()
    return process


def wait_for(url: str, processes: list[tuple[str, subprocess.Popen[str]]], timeout: float = 20) -> None:
    deadline = time.monotonic() + timeout
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        failed = next(((name, p) for name, p in processes if p.poll() is not None), None)
        if failed:
            raise RuntimeError(
                f"{failed[0]} terminó antes de iniciar correctamente "
                f"(código {failed[1].returncode})."
            )
        try:
            with opener.open(url, timeout=1) as response:
                if response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise RuntimeError(f"Tiempo de espera agotado para {url}")


def start_and_confirm(
    command: list[str],
    source: str,
    health_url: str,
    environment: dict[str, str],
    processes: list[tuple[str, subprocess.Popen[str]]],
    working_directory: Path = ROOT,
) -> subprocess.Popen[str]:
    """Inicia un proceso y reintenta una vez si Windows lo cierra al arrancar."""
    for attempt in range(2):
        process = start_process(command, source, environment, working_directory)
        processes.append((source, process))
        try:
            wait_for(health_url, processes)
            time.sleep(0.45)
            if process.poll() is not None:
                raise RuntimeError(
                    f"{source} terminó durante la estabilización "
                    f"(código {process.returncode})."
                )
            log(f"{source.capitalize()} listo.")
            return process
        except RuntimeError:
            if process.poll() is None or attempt == 1:
                raise
            processes.remove((source, process))
            log(f"{source} se cerró durante el arranque; reintentando una vez…")
            time.sleep(0.6)
    raise RuntimeError(f"No fue posible iniciar {source}.")


def stop_all(processes: list[tuple[str, subprocess.Popen[str]]]) -> None:
    log("Cerrando SingAI…")
    for _name, process in reversed(processes):
        if process.poll() is None:
            process.terminate()
    deadline = time.monotonic() + 4
    for _name, process in processes:
        remaining = max(0.1, deadline - time.monotonic())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            process.kill()
    log("Todos los servicios se cerraron correctamente.")


def main() -> int:
    configure_console()
    print("\n  🤟  SINGAI — Aprende a conectar\n")
    node = find_node()
    if not node:
        log(
            "No se encontró Node.js. Instala Node.js 22 o posterior desde "
            "https://nodejs.org y vuelve a ejecutar main.py.",
            "ERROR",
        )
        return 1

    processes: list[tuple[str, subprocess.Popen[str]]] = []
    try:
        configure_email()
        run_setup(node)
        busy = occupied_ports()
        if busy:
            joined = ", ".join(str(port) for port in busy)
            raise RuntimeError(
                f"Los puertos {joined} ya están ocupados. Cierra cualquier otra "
                "ejecución de SingAI y vuelve a intentarlo."
            )
        environment = os.environ.copy()
        environment.setdefault("NODE_ENV", "development")
        environment.setdefault("NO_COLOR", "1")

        for name, (script, health) in SERVICES.items():
            start_and_confirm(
                [str(node), str(ROOT / script)],
                name,
                health,
                environment,
                processes,
            )
            if name == "CORREO":
                report_mail_mode()

        vite = ROOT / "aplicaciones/interfaz/node_modules/vite/bin/vite.js"
        start_and_confirm(
            [str(node), str(vite), "--host", "0.0.0.0", "--port", "5173", "--strictPort"],
            "WEB",
            APP_HEALTH_URL,
            environment,
            processes,
            ROOT / "aplicaciones/interfaz",
        )

        print("\n" + "=" * 58)
        log(f"SingAI está funcionando en {APP_URL}")
        log("Presiona Ctrl+C para cerrar todo.")
        print("=" * 58 + "\n")
        webbrowser.open(APP_URL, new=2)

        while True:
            failed = next(((name, p) for name, p in processes if p.poll() is not None), None)
            if failed:
                raise RuntimeError(f"El proceso {failed[0]} se cerró inesperadamente.")
            time.sleep(0.8)
    except KeyboardInterrupt:
        print()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        log(str(error), "ERROR")
        return 1
    finally:
        if processes:
            stop_all(processes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
