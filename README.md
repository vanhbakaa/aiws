# aiws

Desktop workspace for AI coding CLIs. Run Claude Code, Codex and other agent CLIs side by side, each isolated per project, in one window.

![aiws](docs/screenshot.png)

## What it does

aiws embeds the real AI command line tools as live terminals, so you keep the exact CLI experience and gain a project focused workspace around it.

Every project runs in its own isolated profile, so logins, sessions and history never leak between projects. You can sign in to several accounts of the same provider and switch between them inside a running session to get around rate limits.

A conversation started with one provider can carry over to another. Opening Codex in a project that already has a Claude conversation rebuilds it as a native Codex session, so the new agent keeps the context.

The right panel shows the live account, model, reasoning effort, context usage and rate limits for the active terminal.

## Download

Get the Windows installer or the portable build from the [Releases](https://github.com/vanhbakaa/aiws/releases) page.

The build is not code signed, so Windows SmartScreen shows a prompt on first launch. Choose More info, then Run anyway.

## Build from source

Node 18 or newer is required.

```bash
npm install
npm run gui:dev        # run in development
npm run gui:package    # build the Windows installer and portable exe
```

## Stack

Electron for the window, React and xterm.js for the interface, on a shared TypeScript core. Terminals use a prebuilt native pty binary, so no compiler toolchain is needed.

## License

Apache 2.0
