class_name StrategyView
extends Node3D
## Vue stratégique 3D : plan de référence + altitude, ordres secrets,
## brouillard de guerre, tours simultanés en "hot-seat" (2 joueurs, 1 écran).

signal orders_submitted(orders: Array)

const PLAYER_COLORS := [Color(0.25, 0.55, 1.0), Color(1.0, 0.35, 0.25)]
const PLAYER_COUNT := 2

var state: GameState
var camera: Camera3D
var pivot: Node3D
var lines: MeshInstance3D
var hud: Label
var hud_layer: CanvasLayer

var ship_nodes := {}            # ship_id -> MeshInstance3D
var current_player := 0
var planning := true
var selected_id := -1
var target_altitude := 0.0
var orders := {}                # ordres du joueur courant : ship_id -> MoveOrder
var submitted: Array = []       # ordres déjà validés par les joueurs précédents

var yaw := 0.0
var pitch := -0.6
var distance := 220.0


func setup(p_state: GameState) -> void:
	state = p_state

	pivot = Node3D.new()
	add_child(pivot)
	camera = Camera3D.new()
	camera.far = 3000.0
	pivot.add_child(camera)
	_update_camera()
	camera.make_current()

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.01, 0.01, 0.03)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.7, 0.7, 0.8)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	lines = MeshInstance3D.new()
	lines.mesh = ImmediateMesh.new()
	lines.material_override = _line_material()
	add_child(lines)

	_build_grid()
	_build_ships()

	hud_layer = CanvasLayer.new()
	add_child(hud_layer)
	hud = Label.new()
	hud.position = Vector2(16, 16)
	hud_layer.add_child(hud)

	begin_planning()


func begin_planning() -> void:
	current_player = 0
	planning = true
	selected_id = -1
	orders.clear()
	submitted.clear()
	_refresh_visibility()


# Activer / désactiver la vue (pendant un combat, par exemple).
func set_active(active: bool) -> void:
	visible = active
	hud_layer.visible = active
	set_process(active)
	set_process_unhandled_input(active)
	if active:
		camera.make_current()


# Rejoue les positions calculées par TurnResolver (animation du tour).
func play_frames(frames: Array) -> void:
	for frame in frames:
		for id in frame:
			ship_nodes[id].position = frame[id]
		await get_tree().create_timer(0.03).timeout


# ---------------------------------------------------------------- entrées

func _unhandled_input(event: InputEvent) -> void:
	if not planning:
		return
	if event is InputEventMouseMotion:
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			yaw -= event.relative.x * 0.005
			pitch = clampf(pitch - event.relative.y * 0.005, -1.5, -0.1)
			_update_camera()
	elif event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_wheel(1.0)
			MOUSE_BUTTON_WHEEL_DOWN:
				_wheel(-1.0)
			MOUSE_BUTTON_LEFT:
				_on_left_click(event.position)
	elif event.is_action_pressed("ui_accept"):
		_end_planning()
	elif event.is_action_pressed("ui_cancel"):
		selected_id = -1


func _wheel(dir: float) -> void:
	if Input.is_key_pressed(KEY_SHIFT):
		if selected_id != -1:
			target_altitude += dir * 5.0      # Maj + molette = altitude de l'ordre
	else:
		distance = clampf(distance * (1.0 - dir * 0.1), 30.0, 900.0)
		_update_camera()


func _on_left_click(pos: Vector2) -> void:
	var picked := _pick_ship(pos)
	if picked != -1 and state.ships[picked].owner_id == current_player:
		selected_id = picked
		target_altitude = state.ships[picked].position.y
		return
	if selected_id == -1:
		return
	var point = _mouse_on_plane(pos, target_altitude)
	if point != null:
		orders[selected_id] = MoveOrder.create(selected_id, point)


func _end_planning() -> void:
	submitted.append_array(orders.values())
	orders.clear()
	selected_id = -1
	if current_player < PLAYER_COUNT - 1:
		current_player += 1                     # au tour du joueur suivant (ordres cachés)
		_refresh_visibility()
	else:
		planning = false
		var all_orders := submitted.duplicate()
		submitted.clear()
		orders_submitted.emit(all_orders)       # tous les ordres partent ensemble


# ---------------------------------------------------------------- boucle

func _process(delta: float) -> void:
	var move := Vector3.ZERO
	if Input.is_physical_key_pressed(KEY_W):   # = Z sur AZERTY
		move.z -= 1.0
	if Input.is_physical_key_pressed(KEY_S):
		move.z += 1.0
	if Input.is_physical_key_pressed(KEY_A):   # = Q sur AZERTY
		move.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D):
		move.x += 1.0
	if move != Vector3.ZERO:
		pivot.position += Basis(Vector3.UP, yaw) * move.normalized() * distance * 0.8 * delta
	_redraw()
	_update_hud()


func _update_camera() -> void:
	pivot.rotation = Vector3(pitch, yaw, 0.0)
	camera.position = Vector3(0.0, 0.0, distance)


func _update_hud() -> void:
	var sel := ""
	if selected_id != -1:
		sel = "\nSélection : %s #%d · altitude de l'ordre : %.0f" % [
			state.ships[selected_id].type, selected_id, target_altitude]
	var status := "Tour %d — Joueur %d" % [state.turn, current_player + 1]
	if not planning:
		status = "Résolution du tour…"
	hud.text = status + sel + "\nClic gauche : sélectionner / ordonner · Maj+molette : altitude" \
		+ "\nClic droit + glisser : orbite · molette : zoom · ZQSD : déplacer la vue" \
		+ "\nEntrée : valider les ordres"


# ---------------------------------------------------------------- construction

func _build_ships() -> void:
	for id in state.ships:
		var s: ShipData = state.ships[id]
		var length: float = ShipData.TYPES[s.type]["length_m"] / 25.0   # taille visuelle
		var box := BoxMesh.new()
		box.size = Vector3(length * 0.3, length * 0.2, length)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = PLAYER_COLORS[s.owner_id]
		box.material = mat
		var node := MeshInstance3D.new()
		node.mesh = box
		node.position = s.position
		add_child(node)
		ship_nodes[id] = node


func _build_grid() -> void:
	var grid := MeshInstance3D.new()
	var m := ImmediateMesh.new()
	m.surface_begin(Mesh.PRIMITIVE_LINES)
	for i in range(-8, 9):
		var o := i * 25.0
		var col := Color(0.25, 0.25, 0.35)
		_line(m, Vector3(o, 0.0, -200.0), Vector3(o, 0.0, 200.0), col)
		_line(m, Vector3(-200.0, 0.0, o), Vector3(200.0, 0.0, o), col)
	m.surface_end()
	grid.mesh = m
	grid.material_override = _line_material()
	add_child(grid)


# Brouillard de guerre : on ne voit que ses vaisseaux et les ennemis à portée.
func _refresh_visibility() -> void:
	var mine := state.ships_of(current_player)
	for id in ship_nodes:
		var s: ShipData = state.ships[id]
		var seen := s.owner_id == current_player
		if not seen:
			for m in mine:
				if m.position.distance_to(s.position) <= m.detection_range:
					seen = true
					break
		ship_nodes[id].visible = seen and s.alive


# ---------------------------------------------------------------- dessin / picking

func _pick_ship(mouse: Vector2) -> int:
	var best := -1
	var best_dist := 30.0   # pixels
	for id in ship_nodes:
		var node: MeshInstance3D = ship_nodes[id]
		if not node.visible or camera.is_position_behind(node.global_position):
			continue
		var d := camera.unproject_position(node.global_position).distance_to(mouse)
		if d < best_dist:
			best_dist = d
			best = id
	return best


# Point où le rayon de la souris coupe le plan horizontal à l'altitude donnée.
func _mouse_on_plane(pos: Vector2, altitude: float):
	var origin := camera.project_ray_origin(pos)
	var dir := camera.project_ray_normal(pos)
	return Plane(Vector3.UP, altitude).intersects_ray(origin, dir)


func _redraw() -> void:
	var m: ImmediateMesh = lines.mesh
	m.clear_surfaces()
	m.surface_begin(Mesh.PRIMITIVE_LINES)

	# "Bâton" vertical sous chaque vaisseau visible : lit l'altitude d'un coup d'œil.
	for id in ship_nodes:
		var n: MeshInstance3D = ship_nodes[id]
		if not n.visible:
			continue
		var c: Color = PLAYER_COLORS[state.ships[id].owner_id]
		_line(m, n.position, Vector3(n.position.x, 0.0, n.position.z), c * 0.6)

	# Ordres confirmés du joueur courant.
	if planning:
		for id in orders:
			var o: MoveOrder = orders[id]
			var start: Vector3 = state.ships[id].position
			_line(m, start, o.target, Color.GREEN)
			_line(m, o.target, Vector3(o.target.x, 0.0, o.target.z), Color.GREEN * 0.6)

	# Aperçu de l'ordre en cours.
	if planning and selected_id != -1:
		var sp: Vector3 = state.ships[selected_id].position
		_cross(m, sp, 4.0, Color.WHITE)
		var hover = _mouse_on_plane(get_viewport().get_mouse_position(), target_altitude)
		if hover != null:
			_line(m, sp, hover, Color.WHITE)
			_line(m, hover, Vector3(hover.x, 0.0, hover.z), Color.GRAY)

	m.surface_end()


func _line(m: ImmediateMesh, a: Vector3, b: Vector3, color: Color) -> void:
	m.surface_set_color(color)
	m.surface_add_vertex(a)
	m.surface_set_color(color)
	m.surface_add_vertex(b)


func _cross(m: ImmediateMesh, p: Vector3, size: float, color: Color) -> void:
	_line(m, p - Vector3(size, 0, 0), p + Vector3(size, 0, 0), color)
	_line(m, p - Vector3(0, size, 0), p + Vector3(0, size, 0), color)
	_line(m, p - Vector3(0, 0, size), p + Vector3(0, 0, size), color)


func _line_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	return mat
