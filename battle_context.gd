class_name BattleContext
extends RefCounted
## Le "pont" entre les deux modes : les positions stratégiques deviennent
## la scène de combat. Positions relatives (y compris l'altitude) conservées
## et mises à l'échelle.

const SCALE := 50.0   # 1 unité stratégique = 50 m en combat

var ships: Array = []        # dictionnaires : id, owner_id, type, pos, hull
var center: Vector3
var player_owner: int


static func build(state: GameState, ship_ids: Array, p_player: int) -> BattleContext:
	var ctx := BattleContext.new()
	ctx.player_owner = p_player

	var sum := Vector3.ZERO
	for id in ship_ids:
		sum += state.ships[id].position
	ctx.center = sum / float(ship_ids.size())

	for id in ship_ids:
		var s: ShipData = state.ships[id]
		ctx.ships.append({
			"id": s.id,
			"owner_id": s.owner_id,
			"type": s.type,
			"pos": (s.position - ctx.center) * SCALE,
			"hull": s.hull,
		})
	return ctx
