"""Supervise the three existing services in one free hosting instance."""

import os
import signal
import subprocess
import sys
import time


def main():
    # Retained this supervisor for the retired hosted deployment path. Local
    # development was launched through start.ps1 and did not execute this module.
    required = ("SPRING_DATASOURCE_URL", "SPRING_DATASOURCE_USERNAME", "SPRING_DATASOURCE_PASSWORD")
    if any(not os.environ.get(key) for key in required):
        print(
            "Missing server database settings. Configure them in the hosting dashboard.", flush=True
        )
        return 1
    commands = [
        (
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "5000",
            ],
            "/app/python",
        ),
        (
            [
                "java",
                "-Xms48m",
                "-Xmx192m",
                "-XX:MaxMetaspaceSize=128m",
                "-Xss512k",
                "-XX:ActiveProcessorCount=1",
                "-XX:TieredStopAtLevel=1",
                "-jar",
                "/app/finapp.jar",
            ],
            "/app",
        ),
        (["node", "--max-old-space-size=64", "express.js"], "/app/frontend"),
    ]
    children = []
    stopped = False

    def stop(_signum=None, _frame=None):
        # Propagated shutdown to every child so an exited service did not leave
        # unrelated Python, Java, or Node children running in the hosted instance.
        nonlocal stopped
        stopped = True
        for child in children:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    exit_code = 0
    try:
        for command, directory in commands:
            children.append(subprocess.Popen(command, cwd=directory))
        while not stopped:
            for child in children:
                result = child.poll()
                if result is not None:
                    print(
                        "A FinApp service exited; restarting the whole instance is required.",
                        flush=True,
                    )
                    exit_code = result or 1
                    stop()
                    break
            time.sleep(0.25)
    finally:
        stop()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
