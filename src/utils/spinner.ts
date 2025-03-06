import picocolors from "picocolors";

export class SimpleSpinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private interval: NodeJS.Timeout | null = null;
  private currentFrame = 0;
  private text: string;
  private shouldStop = false;

  constructor(text: string) {
    this.text = text;
  }

  start() {
    process.stdout.write("\x1B[?25l"); // Hide cursor
    this.interval = setInterval(() => {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(
        `${picocolors.cyan(this.frames[this.currentFrame])} ${
          this.text
        } (Press ESC to cancel)`
      );
      this.currentFrame = ++this.currentFrame % this.frames.length;
    }, 80);

    // Handle ESC key
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const keyPressHandler = (key: string) => {
      if (key === "\u001b") {
        // ESC key
        this.shouldStop = true;
        process.stdin.removeListener("data", keyPressHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
    };

    process.stdin.on("data", keyPressHandler);

    return this;
  }

  stop(success = true) {
    if (this.interval) {
      clearInterval(this.interval);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      const symbol = success ? picocolors.green("✓") : picocolors.red("✗");
      console.log(`${symbol} ${this.text}`);
      process.stdout.write("\x1B[?25h"); // Show cursor

      // Cleanup stdin
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }

  setText(text: string) {
    this.text = text;
  }

  isStopped() {
    return this.shouldStop;
  }
}
