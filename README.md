# pi-tps

Tokens-per-second notification extension for pi.

## Install

```json
{
  "extensions": ["github:ravshansbox/pi-tps"]
}
```

## Usage

Pi loads the extension from `./index.ts` and shows a TUI notification after each agent run with token counts, throughput, elapsed time, and cost.

For example, after an assistant response finishes, pi can show a notification such as `↑12k ↓1.4k ↯84.2 16.7s $0.031 • (anthropic) claude-sonnet • thinking off`.

## Development

```bash
npm install
npm run typecheck
```
