extends Node3D
## Point d'entrée. À attacher au nœud racine (Node3D) de main.tscn.
## Boucle : ordres des deux camps -> résolution simultanée -> animation
## -> combat(s) en vue première personne -> application des résultats -> tour suivant.

var state := GameState.new()
var strategy: StrategyView


func _ready() -> void:
	_setup_demo_state()
	strategy = StrategyView.new()
	add_child(strategy)
	strategy.setup(state)
	strategy.orders_submitted.connect(_on_orders_submitted)


func _setup_demo_state() -> void:
	state.add_ship(0, "cruiser", Vector3(-80, 0, 0))
	state.add_ship(0, "frigate", Vector3(-80, 10, 20))
	state.add_ship(0, "frigate", Vector3(-80, -5, -20))
	state.add_ship(1, "cruiser", Vector3(80, 5, 0))
	state.add_ship(1, "frigate", Vector3(80, 15, 15))


func _on_orders_submitted(orders: Array) -> void:
	var result := TurnResolver.resolve(state, orders)
	await strategy.play_frames(result["frames"])
	for ship_ids in result["battles"]:
		await _run_battle(ship_ids)
	state.turn += 1
	strategy.begin_planning()


func _run_battle(ship_ids: Array) -> void:
	# Prototype : le joueur 0 pilote. En PvP, chaque client recevrait le
	# BattleContext avec son propre player_owner.
	var ctx := BattleContext.build(state, ship_ids, 0)
	strategy.set_active(false)

	var battle := BattleView.new()
	add_child(battle)
	battle.setup(ctx)
	var result: Dictionary = await battle.finished
	battle.queue_free()

	strategy.set_active(true)
	_apply_result(result)


func _apply_result(result: Dictionary) -> void:
	var damage: Dictionary = result["damage"]
	for id in damage:
		var s: ShipData = state.ships[id]
		s.hull -= damage[id]
		if s.hull <= 0.0:
			s.alive = false
