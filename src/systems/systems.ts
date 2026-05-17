import { recipes, upgrades, type Recipe } from "../data/gameData";

export class RecipeSystem {
  getAll(): Recipe[] {
    return recipes;
  }
  getById(id: string): Recipe | undefined {
    return recipes.find((r) => r.id === id);
  }
}

export interface ActiveOrder {
  recipeId: string;
  index: number;
  mistakes: number;
  done: boolean;
}

export class OrderSystem {
  createOrder(recipeId: string): ActiveOrder {
    return { recipeId, index: 0, mistakes: 0, done: false };
  }

  addIngredient(order: ActiveOrder, recipe: Recipe, ingredient: string): ActiveOrder {
    if (order.done) return order;
    const expected = recipe.ingredients[order.index];
    if (expected === ingredient) {
      order.index += 1;
      if (order.index >= recipe.ingredients.length) order.done = true;
    } else {
      order.mistakes += 1;
    }
    return order;
  }
}

export class TimingSystem {
  evaluate(delta: number): "perfect" | "good" | "early" | "late" | "miss" {
    const abs = Math.abs(delta);
    if (abs <= 0.03) return "perfect";
    if (abs <= 0.08) return "good";
    if (delta < 0 && abs <= 0.14) return "early";
    if (delta > 0 && abs <= 0.14) return "late";
    return "miss";
  }
}

export class TemperatureSystem {
  evaluate(temp: number, range: [number, number]): number {
    const [min, max] = range;
    if (temp >= min && temp <= max) return 1;
    const dist = temp < min ? min - temp : temp - max;
    return Math.max(0, 1 - dist / 25);
  }
}

export class ComboSystem {
  combo = 0;
  boost = 0;
  add(hit: "perfect" | "good" | "early" | "late" | "miss"): void {
    if (hit === "perfect") this.combo += 1;
    else if (hit === "good") this.combo = Math.max(0, this.combo - 1);
    else this.combo = 0;
    this.boost = Math.min(100, this.combo * 2);
  }
  tipMultiplier(): number {
    if (this.combo >= 50) return 1.5;
    if (this.combo >= 30) return 1.3;
    if (this.combo >= 10) return 1.2;
    if (this.combo >= 5) return 1.1;
    return 1;
  }
}

export class EconomySystem {
  reward(base: number, quality: number, tipMultiplier: number): number {
    return Math.round(base * quality * tipMultiplier);
  }
}

export class UpgradeSystem {
  canBuy(coins: number, upgradeId: string, bought: Set<string>): boolean {
    if (bought.has(upgradeId)) return false;
    const up = upgrades.find((u) => u.id === upgradeId);
    if (!up) return false;
    return coins >= up.basePrice;
  }
}
