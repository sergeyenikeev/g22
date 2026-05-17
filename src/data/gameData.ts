export type IngredientId =
  | "cup"
  | "glass"
  | "holder"
  | "kettle"
  | "boilingWater"
  | "blackTea"
  | "greenTea"
  | "herbalTea"
  | "strongTea"
  | "sugar"
  | "lemon"
  | "honey"
  | "jam"
  | "mint"
  | "cinnamon"
  | "ginger"
  | "seaberry"
  | "bagel"
  | "cookie"
  | "pie";

export interface Recipe {
  id: string;
  name: string;
  ingredients: IngredientId[];
  idealTemp: [number, number];
  brewTimeMs: number;
  difficulty: number;
  reward: number;
  hint: string;
}

export interface ClientType {
  id: string;
  name: string;
  patience: number;
  speedBonus: number;
  qualityStrictness: number;
}

export interface Upgrade {
  id: string;
  category: "samovar" | "kitchen" | "service";
  name: string;
  effect: string;
  basePrice: number;
}

export interface CampaignDay {
  day: number;
  chapter: number;
  chapterName: string;
  modifier: string;
  targetScore: number;
}

const recipeRows: [string, string, IngredientId[], [number, number], number, number, number, string][] = [
  ["r01", "Чай с сахаром", ["cup", "blackTea", "boilingWater", "sugar"], [78, 86], 2600, 1, 18, "Сначала заварка, потом кипяток, сахар в конце."],
  ["r02", "Чай с лимоном", ["cup", "blackTea", "boilingWater", "lemon"], [76, 84], 2500, 1, 20, "Лимон клади последним, чтобы не перебить вкус."],
  ["r03", "Крепкий чай", ["cup", "strongTea", "boilingWater"], [84, 92], 3100, 2, 24, "Не передерживай, иначе уйдешь в горечь."],
  ["r04", "Зеленый чай", ["cup", "greenTea", "boilingWater"], [68, 76], 2200, 2, 24, "Высокая температура портит зеленый чай."],
  ["r05", "Мятный чай", ["cup", "herbalTea", "boilingWater", "mint"], [70, 78], 2400, 2, 26, "Мяту добавляй после заваривания."],
  ["r06", "Чай с медом", ["cup", "blackTea", "boilingWater", "honey"], [62, 72], 2500, 2, 27, "Мед не любит кипяток, дай чаю остыть."],
  ["r07", "Чай с вареньем", ["cup", "blackTea", "boilingWater", "jam"], [74, 82], 2500, 2, 27, "Сладость усиливает чаевые у семейных гостей."],
  ["r08", "Детский чай", ["cup", "herbalTea", "boilingWater", "jam"], [58, 66], 2000, 2, 29, "Главное - мягкая температура."],
  ["r09", "Зимний чай", ["cup", "blackTea", "boilingWater", "cinnamon", "ginger"], [82, 90], 3300, 3, 34, "Держи горячим, но не перегрей."],
  ["r10", "Облепиховый чай", ["cup", "herbalTea", "boilingWater", "seaberry", "honey"], [64, 72], 2900, 3, 35, "Облепиха любит умеренную температуру."],
  ["r11", "Чай с имбирем", ["cup", "blackTea", "boilingWater", "ginger"], [80, 88], 2800, 3, 33, "Имбирь нужно поймать точно в тайминг."],
  ["r12", "Чай с корицей", ["cup", "blackTea", "boilingWater", "cinnamon"], [78, 86], 2800, 3, 33, "Корица повышает ценность заказа в театре."],
  ["r13", "Купеческий набор", ["holder", "cup", "blackTea", "boilingWater", "sugar", "bagel"], [78, 88], 3200, 4, 39, "Сначала подстаканник, затем чашка."],
  ["r14", "Вокзальный крепкий", ["glass", "strongTea", "boilingWater", "sugar"], [84, 92], 2900, 4, 38, "На вокзале важна скорость подачи."],
  ["r15", "Театральный чай", ["holder", "cup", "greenTea", "boilingWater", "lemon", "cookie"], [70, 78], 3000, 4, 40, "Красивая подача дает бонус."],
  ["r16", "Дачный с вареньем", ["cup", "blackTea", "boilingWater", "jam", "cookie"], [74, 84], 2800, 3, 37, "Снек обязательно подай вместе с чаем."],
  ["r17", "Согревающий сбор", ["cup", "strongTea", "boilingWater", "cinnamon", "ginger", "honey"], [80, 90], 3400, 5, 45, "Комбинация специй требует точного порядка."],
  ["r18", "Чай на вынос", ["glass", "blackTea", "boilingWater", "sugar"], [76, 84], 2300, 2, 28, "В стакане остывает быстрее."],
  ["r19", "Чай с баранками", ["cup", "blackTea", "boilingWater", "bagel"], [78, 88], 2600, 2, 30, "Баранка считается обязательным снеком."],
  ["r20", "Фирменный самоварный", ["holder", "cup", "strongTea", "boilingWater", "lemon", "honey", "bagel"], [80, 90], 3600, 5, 55, "Подай без промахов для редкой награды."]
];

export const recipes: Recipe[] = recipeRows.map(([id, name, ingredients, idealTemp, brewTimeMs, difficulty, reward, hint]) => ({
  id,
  name,
  ingredients,
  idealTemp,
  brewTimeMs,
  difficulty,
  reward,
  hint
}));

const clientRows: [string, string, number, number, number][] = [
  ["courier", "Курьер", 65, 1.4, 0.8],
  ["granny", "Бабушка", 120, 1.0, 1.3],
  ["pupil", "Школьник", 95, 1.1, 1.0],
  ["office", "Офисный работник", 80, 1.2, 1.0],
  ["tourist", "Турист", 90, 1.1, 1.1],
  ["taster", "Дегустатор", 70, 1.8, 1.5],
  ["regular", "Постоянный гость", 100, 1.3, 1.2],
  ["family", "Семья", 110, 1.2, 1.1],
  ["builder", "Строитель", 85, 1.2, 1.2],
  ["artist", "Артист", 92, 1.3, 1.3],
  ["neighbor", "Сосед", 95, 0.9, 0.9],
  ["festive", "Праздничный гость", 88, 1.6, 1.4]
];

export const clientTypes: ClientType[] = clientRows.map(([id, name, patience, speedBonus, qualityStrictness]) => ({
  id,
  name,
  patience,
  speedBonus,
  qualityStrictness
}));

const baseUpgrades: Upgrade[] = [
  ["samovar", "Медная стенка", "Самовар медленнее перегревается", 220],
  ["samovar", "Точный кран", "Проще попасть в идеальный налив", 340],
  ["samovar", "Паровой стабилизатор", "Меньше рывков у кольца", 500],
  ["kitchen", "Широкий поднос", "Можно держать запасной ингредиент", 430],
  ["kitchen", "Теплый стол", "Готовый чай медленнее остывает", 620],
  ["kitchen", "Полка снеков", "Снеки появляются чаще", 700],
  ["service", "Чайная книга", "Показывает следующий шаг", 390],
  ["service", "Колокольчик", "Следующий гость приходит быстрее", 570],
  ["service", "Очередь с лавочкой", "Гости дольше ждут", 810],
  ["service", "Фирменные салфетки", "Чаевые выше при идеале", 980]
].map(([category, name, effect, basePrice], index) => ({
  id: `u${index + 1}`,
  category: category as Upgrade["category"],
  name: name as string,
  effect: effect as string,
  basePrice: basePrice as number
}));

export const upgrades: Upgrade[] = Array.from({ length: 30 }, (_, i) => {
  const base = baseUpgrades[i % baseUpgrades.length];
  return {
    ...base,
    id: `${base.id}_${i + 1}`,
    name: `${base.name} ${Math.floor(i / 10) + 1}`,
    basePrice: base.basePrice + Math.floor(i / 10) * 260
  };
});

const chapterNames = ["Дворовая чайная", "Вокзал", "Зимняя ярмарка", "Театральный буфет", "Чайный фестиваль"];
const chapterModifiers = [
  "Медленное вращение и один активный заказ.",
  "Срочные гости и заказы на вынос.",
  "Напитки остывают быстрее, больше пара.",
  "Важные гости и высокие требования к качеству.",
  "Высокая скорость, сложные комбинации и несколько заказов."
];

export const campaignDays: CampaignDay[] = Array.from({ length: 40 }, (_, idx) => {
  const day = idx + 1;
  const chapter = Math.min(5, Math.floor(idx / 8) + 1);
  return {
    day,
    chapter,
    chapterName: chapterNames[chapter - 1],
    modifier: chapterModifiers[chapter - 1],
    targetScore: 120 + day * 14
  };
});

export const cosmetics = {
  cups: ["Классическая чашка", "Синяя чашка", "Праздничная чашка", "Резная чашка"],
  samovars: ["Медный самовар", "Серебряный самовар", "Ярмарочный самовар", "Фестивальный самовар"],
  tablecloths: ["Льняная скатерть", "Красная скатерть", "Звездная скатерть"],
  trays: ["Деревянный поднос", "Латунный поднос", "Резной поднос"],
  backgrounds: ["Уютный двор", "Шумный вокзал", "Снежная ярмарка", "Театральный зал", "Фестивальная площадь"],
  steamEffects: ["Мягкий пар", "Искристый пар", "Зимний пар"]
};
