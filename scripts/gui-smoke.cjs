// Headless de-risk: run under Electron (`electron scripts/gui-smoke.cjs`) to prove the N-API
// prebuilt @lydell/node-pty loads in Electron's runtime WITHOUT rebuild/MSVC, and a PTY streams.
// Prints PTY-OK on success. Not part of the app; a one-off verification harness.
const { app } = require("electron");

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  let pty;
  try {
    pty = require("@lydell/node-pty");
  } catch (e) {
    console.log("PTY-LOAD-FAIL " + (e && e.message));
    app.exit(1);
    return;
  }
  const shell = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : process.env.SHELL || "/bin/bash";
  let got = 0;
  const proc = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });
  const done = (code) => {
    try {
      proc.kill();
    } catch {}
    app.exit(code);
  };
  proc.onData((d) => {
    got += d.length;
    if (/AIWS_SMOKE_OK/.test(d)) {
      console.log("PTY-OK bytes=" + got + " (node-pty N-API loaded + PTY echo works in Electron)");
      done(0);
    }
  });
  proc.onExit(() => {
    console.log("PTY-EXIT bytes=" + got);
    done(got > 0 ? 0 : 1);
  });
  setTimeout(() => proc.write("echo AIWS_SMOKE_OK\r"), 400);
  setTimeout(() => {
    console.log("TIMEOUT bytes=" + got);
    done(1);
  }, 10000);
});
