import "./style.css";
import { Game } from "./game/engine";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("Missing #game canvas");
}

const game = new Game(canvas);
game.start();
