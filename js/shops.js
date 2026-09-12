// Shops. A counter you can build and stand at, and one in the middle of every
// village, selling the things you would otherwise have to go and find.
// Emeralds are the money, the same as they are for the villagers.
const Store = {
  _stock: null,

  stock() {
    if (this._stock) return this._stock;
    const buy = (cost, id, n, note) => ({ cost, id, n, note: note || '' });
    const sell = (id, n, pay) => ({ sellId: id, sellN: n, pay });
    this._stock = {
      'Weapons': [
        buy(6, I.PISTOL, 1, 'quick, quiet-ish'),
        buy(14, I.RIFLE, 1, 'holds the trigger down'),
        buy(12, I.SHOTGUN, 1, 'eight pellets, close up'),
        buy(24, I.SNIPER, 1, 'one shot, a long way off'),
        buy(1, I.BULLETS, 24, ''),
        buy(3, I.BOW, 1, ''),
        buy(1, I.ARROW, 16, ''),
        buy(9, I.IRON_SWORD, 1, ''),
      ],
      'Explosives': [
        buy(2, B.TNT, 1, 'right-click to arm it'),
        buy(1, I.GUNPOWDER, 4, ''),
        buy(64, B.NUKE, 1, 'do not stand near it'),
      ],
      'Food & drink': [
        buy(2, I.COOKED_BEEF, 3, ''),
        buy(1, I.BERRIES, 6, 'feeds and waters you'),
        buy(1, I.BOTTLE, 2, 'fill it at any water'),
        buy(2, I.COOKED_CHICKEN, 4, ''),
        buy(3, I.APPLE, 6, ''),
      ],
      'Building': [
        buy(1, B.PLANKS, 24, ''),
        buy(1, B.STONE_BRICKS, 24, ''),
        buy(1, B.GLASS, 12, ''),
        buy(2, B.TORCH, 12, ''),
        buy(1, B.WOOL, 8, ''),
        buy(3, B.SHOP, 1, 'a counter of your own'),
      ],
      'Selling': [
        sell(B.COAL_ORE, 12, 1),
        sell(I.IRON_INGOT, 6, 1),
        sell(I.GOLD_INGOT, 4, 1),
        sell(I.DIAMOND, 1, 3),
        sell(I.ECHO_SHARD, 1, 4),
        sell(I.DATA_SHARD, 2, 3),
        sell(I.PRISMARINE_SHARD, 4, 1),
        sell(B.CORAL_GOLD, 6, 1),
      ],
    };
    return this._stock;
  },

  affordable(o) {
    if (o.sellId) return Inventory.count(o.sellId) >= o.sellN;
    return Inventory.count(I.EMERALD) >= o.cost;
  },

  deal(o, game) {
    if (!this.affordable(o)) return false;
    if (o.sellId) {
      Inventory.take(o.sellId, o.sellN);
      Inventory.add(I.EMERALD, o.pay);
      game.toast('Sold ' + o.sellN + ' × ' + thingName(o.sellId) + ' for ' + o.pay + ' emeralds');
    } else {
      Inventory.take(I.EMERALD, o.cost);
      Inventory.add(o.id, o.n);
      game.hotbarStow(o.id);
      game.toast('Bought ' + thingName(o.id) + (o.n > 1 ? ' ×' + o.n : ''));
    }
    return true;
  },
};
