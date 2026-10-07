class_name BattleView
extends Node3D
## Mode action : reconstruit la scène à partir du BattleContext (positions,
## altitudes, composition des flottes) et laisse le joueur piloter un chasseur.
## Prototype : vol libre seulement. Tirs, IA et dégâts restent à écrire.

signal finished(result: Dictionary)

var ctx: BattleContext
var fighter: Node3D
var throttle := 0.5


func setup(p_ctx: BattleContext) -> void:
	ctx = p_ctx

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.0, 0.0, 0.02)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.35, 0.35, 0.45)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35.0, 40.0, 0.0)
	add_child(sun)

	_spawn_capital_ships()
	_spawn_fighter()

	var layer := CanvasLayer.new()
	add_child(layer)
	var label := Label.new()
	label.position = Vector2(16, 16)
	label.text = "Souris : pilotage · Z / S : poussée · Échap : terminer le combat"
	layer.add_child(label)


# Chaque vaisseau capital apparaît à sa position stratégique relative,
# altitude comprise : l'organisation de la flotte EST la carte de combat.
func _spawn_capital_ships() -> void:
	for d in ctx.ships:
		var length: float = ShipData.TYPES[d["type"]]["length_m"]
		var box := BoxMesh.new()
		box.size = Vector3(length * 0.25, length * 0.15, length)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = StrategyView.PLAYER_COLORS[d["owner_id"]]
		box.material = mat
		var node := MeshInstance3D.new()
		node.mesh = box
		node.position = d["pos"]
		add_child(node)


# Le chasseur décolle du premier vaisseau allié, tourné vers l'ennemi.
# (À terme : le joueur choisit son hangar.)
func _spawn_fighter() -> void:
	var mine := ctx.ships.filter(func(d): return d["owner_id"] == ctx.player_owner)
	var theirs := ctx.ships.filter(func(d): return d["owner_id"] != ctx.player_owner)
	var carrier: Dictionary = mine[0]

	var enemy_pos := Vector3.ZERO
	for d in theirs:
		enemy_pos += d["pos"]
	enemy_pos /= float(theirs.size())

	var start: Vector3 = carrier["pos"]
	var length: float = ShipData.TYPES[carrier["type"]]["length_m"]
	var dir := (enemy_pos - start).normalized()

	fighter = Node3D.new()
	add_child(fighter)
	fighter.look_at_from_position(start + dir * (length * 0.5 + 60.0), enemy_pos)

	var cam := Camera3D.new()
	cam.far = 20000.0
	fighter.add_child(cam)
	cam.make_current()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and fighter != null:
		fighter.rotate_object_local(Vector3.UP, -event.relative.x * 0.002)
		fighter.rotate_object_local(Vector3.RIGHT, -event.relative.y * 0.002)
	elif event.is_action_pressed("ui_cancel"):
		_finish()


func _physics_process(delta: float) -> void:
	if fighter == null:
		return
	if Input.is_physical_key_pressed(KEY_W):   # = Z sur AZERTY
		throttle = clampf(throttle + delta, 0.0, 1.0)
	if Input.is_physical_key_pressed(KEY_S):
		throttle = clampf(throttle - delta, 0.0, 1.0)
	fighter.translate(Vector3(0.0, 0.0, -(40.0 + throttle * 260.0) * delta))
	fighter.transform = fighter.transform.orthonormalized()


func _finish() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	# BattleResult : ship_id -> coque perdue. Vide tant qu'il n'y a pas de tirs.
	finished.emit({"damage": {}})
