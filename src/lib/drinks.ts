/**
 * Built-in drinks, so "one Red Bull" or "one espresso" is one tap. Typical values from labels and
 * common references; owner: *"a couple mg difference doesn't matter"*. Every one is editable and
 * you can add your own.
 */

import type { Drink } from "./types";
import { alcoholGrams } from "./alcohol";

const d = (id: string, name: string, ml: number, caffeineMg: number, kcal: number, abv = 0): Drink => ({
  id, name, ml, caffeineMg, kcal, alcoholG: abv ? Math.round(alcoholGrams(ml, abv) * 10) / 10 : 0,
});

export const DRINKS: Drink[] = [
  d("filter", "Filter coffee", 250, 95, 2),
  d("espresso", "Espresso", 30, 63, 1),
  d("double", "Double espresso", 60, 126, 2),
  d("cappuccino", "Cappuccino", 180, 63, 90),
  d("latte", "Latte", 300, 63, 150),
  d("redbull", "Red Bull 250 ml", 250, 80, 112),
  d("redbull-sf", "Red Bull Sugarfree 250 ml", 250, 80, 8),
  d("monster", "Monster 500 ml", 500, 160, 230),
  d("hell", "Hell Energy 250 ml", 250, 80, 115),
  d("hell-zero", "Hell Zero 250 ml", 250, 80, 5),
  d("hell-500", "Hell Energy 500 ml", 500, 160, 230),
  d("monster-ultra", "Monster Ultra (zero) 500 ml", 500, 150, 10),
  d("burn", "Burn 500 ml", 500, 160, 225),
  d("long", "Long coffee (hosszú kávé)", 200, 90, 2),
  d("americano", "Americano", 300, 126, 3),
  d("instant", "Instant coffee (1 tsp)", 250, 60, 4),
  d("3in1", "3in1 coffee sachet", 150, 50, 70),
  d("decaf", "Decaf coffee", 250, 3, 2),
  d("iced-coffee", "Iced coffee can 250 ml", 250, 80, 160),
  d("matcha", "Matcha latte", 300, 70, 140),
  d("cola", "Coca-Cola 330 ml", 330, 32, 139),
  d("cola-500", "Coca-Cola 500 ml", 500, 48, 210),
  d("pepsi", "Pepsi 330 ml", 330, 32, 145),
  d("cola-zero", "Coke Zero 330 ml", 330, 32, 1),
  d("black-tea", "Black tea", 250, 47, 2),
  d("green-tea", "Green tea", 250, 28, 2),
  d("preworkout", "Pre-workout (1 scoop)", 300, 200, 10),
  d("beer", "Beer 500 ml, 5%", 500, 0, 215, 5),
  d("beer-small", "Beer 330 ml, 5%", 330, 0, 142, 5),
  d("wine", "Wine 150 ml, 12%", 150, 0, 125, 12),
  d("froccs", "Fröccs (spritzer) 200 ml", 200, 0, 85, 6),
  d("prosecco", "Prosecco 120 ml, 11%", 120, 0, 90, 11),
  d("long-drink", "Long drink (spirit + mixer)", 300, 0, 200, 5.3),
  d("shot", "Spirit shot 40 ml, 40%", 40, 0, 97, 40),
  d("cider", "Cider 500 ml, 4.5%", 500, 0, 230, 4.5),
];
