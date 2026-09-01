// Villager trading. Emeralds are the currency: sell them your surplus, buy their goods.
const TRADES = {};

function defineTrades() {
  const sell = (give, count, emeralds) => ({ give: [[give, count]], get: [I.EMERALD, emeralds], uses: 8 });
  const buy = (emeralds, get, count) => ({ give: [[I.EMERALD, emeralds]], get: [get, count], uses: 6 });

  TRADES.farmer = [
    sell(B.GREEN_WOOL, 8, 1),          // the crops growing in village farms
    sell(I.PORKCHOP, 6, 1),
    buy(1, I.BEEF, 4),
    buy(2, B.PLANKS, 16),
  ];
  TRADES.butcher = [
    sell(I.CHICKEN, 8, 1),
    sell(I.LEATHER, 6, 1),
    buy(1, I.PORKCHOP, 5),
    buy(3, I.LEATHER_CHESTPLATE, 1),
  ];
  TRADES.toolsmith = [
    sell(B.COAL_ORE, 12, 1),
    sell(I.STICK, 24, 1),
    buy(3, I.IRON_PICKAXE, 1),
    buy(4, I.IRON_AXE, 1),
    buy(12, I.DIAMOND_PICKAXE, 1),
  ];
  TRADES.armourer = [
    sell(B.IRON_ORE, 8, 2),
    buy(3, I.IRON_HELMET, 1),
    buy(6, I.IRON_CHESTPLATE, 1),
    buy(14, I.DIAMOND_CHESTPLATE, 1),
  ];
  TRADES.mason = [
    sell(B.COBBLESTONE, 16, 1),
    sell(B.CLAY, 8, 1),
    buy(1, B.STONE_BRICKS, 8),
    buy(1, B.BRICK, 8),
    buy(2, B.GLASS, 8),
  ];
}

const Trading = {
  villager: null,

  offersFor(mob) {
    if (!mob.offers) {
      const list = TRADES[mob.def.profession] || [];
      mob.offers = list.map(o => ({ give: o.give, get: o.get, left: o.uses }));
    }
    return mob.offers;
  },

  affordable(offer) {
    return offer.left > 0 && offer.give.every(([id, n]) => Inventory.count(id) >= n);
  },

  trade(offer) {
    if (!this.affordable(offer)) return false;
    for (const [id, n] of offer.give) Inventory.take(id, n);
    Inventory.add(offer.get[0], offer.get[1]);
    offer.left--;
    return true;
  },
};
