# aiws

A desktop workspace for AI coding CLIs. Run Claude Code, Codex, and other agent command line tools side by side in one window, each isolated per project.

![aiws](docs/screenshot.png)

## What it does

aiws embeds the real agent CLIs as live terminals, so you keep the exact command line experience and get a project workspace around it: a project sidebar, several terminals per project, and a live context panel.

### Projects

Open a folder to start it as a project. Each project keeps its own terminals, sessions, and history. Removing a project from the workspace keeps its data, so reopening the folder restores everything, and recently closed projects stay under File, Open Recent.

### Accounts

Manage every account you use, across providers, from one panel. It shows each account's type, plan limits, and current usage, and lets you add, rename, remove, or mark a default.

A login belongs to the account rather than the project, so you sign in once and every project reuses it. Work sessions still stay separate per project.

Keep several accounts for one provider and switch between them inside a running terminal to spread work across rate limits. Switching to an account from a different provider carries the current conversation into a native session for the new agent, so it continues with the full history instead of starting blank.

### Isolated tooling

Each terminal also redirects the config of the external command line tools you run alongside the agent, so their credentials are scoped to the project. Version control, cloud, container, and package tooling read and write their settings inside the project profile, and the set is configurable, so a token or login you set up in one project never leaks into another.

### Context panel

The right panel tracks the active terminal in real time: the account and its type, the model and reasoning effort, context window usage, and the remaining rate limit windows with their reset times.

## Download

Get the latest build for your platform from the [Releases](https://github.com/vanhbakaa/aiws/releases) page. Windows ships an installer and a portable exe, macOS ships a dmg for Apple Silicon, and Linux ships an AppImage.

Installed builds update themselves: a new release downloads in the background and installs when you restart. The portable Windows exe does not self update.

The builds are not code signed. On Windows, SmartScreen shows a prompt; choose More info, then Run anyway. On macOS, Gatekeeper blocks the first launch; right click the app and choose Open. On Linux it runs as is.

## Build from source

Node 18 or newer is required.

```bash
npm install
npm run gui:dev        # run in development
npm run gui:package    # build the installer and portable exe for your platform
```

## Stack

Electron for the window, React and xterm.js for the interface, on a shared TypeScript core. Terminals use a prebuilt native pty binary, so no compiler toolchain is needed.

## License

Apache 2.0
