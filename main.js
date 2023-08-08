
let GEOMETRY;
let WORLD;
let ZOOM;


const TILE_CTOR = () => { return new TileContext(); }
class TileContext {
	#_pos; #_ips; #_id; #_rm;
	constructor() {}
	bind(props) {
		this.#_pos = props.pos;
		this.#_ips = props.ips;
		this.#_id  = props.id;
		this.#_rm  = true; // removable
	}
	bind_perms=(rm)=>this.#_rm = rm;
	uid=()=>this.#_id;
	ips=()=>this.#_ips;
	pos=()=>this.#_pos;
	perms=()=>this.#_rm;
	draw2D=(cv,wire=false)=> {
		cv.rect(this.#_pos.x(),this.#_pos.y(),1,1);
		if(wire) cv.line(this.#_pos.x(),this.#_pos.y(),this.#_pos.x()+1,this.#_pos.y()+1);
	}
	draw_edge2D=(p,cv)=> {
		const a = this.#_pos;
// box vertices
		const b = add2(a, new vec2(1,0));
		const c = add2(b, new vec2(0,1));
		const d = add2(c, new vec2(-1,0));
// center of box
		const o = add2(a, new vec2(0.5,0.5));
		const x = sub2(p,o);
				
		const dists = [
			{idx:0,d:proj2s(x,new vec2(0,-1)) }, // ab
			{idx:1,d:proj2s(x,new vec2(1, 0)) }, // bc
			{idx:2,d:proj2s(x,new vec2(0, 1)) }, // cd
			{idx:3,d:proj2s(x,new vec2(-1,0)) }, // da
		];
		dists.sort((b,a)=>a.d-b.d);
		const i = dists[0].d > 0.025 ? dists[0].idx : -1;

// draw the edge
		if(i == 0) { // draw ab
			cv.line(a.x(),a.y(),b.x(),b.y());
		}else if(i == 1) { // draw bc
			cv.line(b.x(),b.y(),c.x(),c.y());
		}else if(i == 2) { // draw cd
			cv.line(c.x(),c.y(),d.x(),d.y());
		}else if(i == 3) { // draw da
			cv.line(d.x(),d.y(),a.x(),a.y());
		}
	}
}

class WorldContext {
	#_brd; #_til; #_geo;
	constructor() {}
	bind=(dim)=> {
		const w = ~~dim.x();
		const h = ~~dim.y();

		this.#_brd = new Board(new vec2(w,h), null);
		this.#_til = new ObjectList(new UIDHandler(), {});
		this.#_geo = new GeometryContext();
// after the fact, construct our lattice with our ObjectList
		const s 	= w*h;
        const left  = new vec2(-w/2,    0);
        const right = new vec2(+w/2,    0);
        const down  = new vec2(0,    -h/2);
        const up    = new vec2(0,    +h/2);

        for(let i=0;i<s;i++) {
            const ix=~~(i%w);
            const iy=~~(i/w);

            const ipx = (ix/w);
            const ipy = (iy/h);
// construct object
			const obj = this.#_til.write_obj(
				TILE_CTOR, {
					ips: new vec2(ix,iy),
					pos: new vec2(
                    (1-ipx)*left.x() + ipx*right.x(),
                    (1-ipy)*down.y() + ipy*up.y())
			});
// write object id into board
			this.#_brd.set(ix,iy,obj.uid());
        }
// construct geometry context
		this.#_geo.bind(new vec2(w,h));
// fill geometry outline
		const rbd = this.#_geo.rbf().data();
		for(let ix=0;ix<w;ix++) {
			const i0 = ix;
			const i1 = ix + w*(h-1);
			rbd[i0] = (1) | (1 << 8) | (1 << 16) | (1 << 24);
			rbd[i1] = (1) | (1 << 8) | (1 << 16) | (1 << 24);
// get the tile at ix and notify it's perms are now different.
			this.#_til.get_obj(i0+1).bind_perms(false);
			this.#_til.get_obj(i1+1).bind_perms(false);
		}
		for(let iy=0;iy<h;iy++) {
			const i0 = w*iy;
			const i1 = w*iy + w-1;

			rbd[i0] = (1) | (1 << 8) | (1 << 16) | (1 << 24);
			rbd[i1] = (1) | (1 << 8) | (1 << 16) | (1 << 24);
// get the tile at ix and notify it's perms are now different.
			this.#_til.get_obj(i0+1).bind_perms(false);
			this.#_til.get_obj(i1+1).bind_perms(false);
		}
	}
	pos_2D_tile_index=(proj)=> {
		const w = this.#_brd.w();
		const h = this.#_brd.h();
		const pix 	= ~~(w/2) + Math.floor(proj.x());
		const piy 	= ~~(h/2) + Math.floor(proj.y());
		return pix+piy*w+1;
	}
	pos_3D_tile_index=(proj)=> {
		const w = this.#_brd.w();
		const h = this.#_brd.h();
		const pix 	= ~~proj.x()
		const piy 	= ~~proj.y();
		return pix+piy*w+1;
	}
	tile_to_world=(tile)=> {
		const tp = tile.pos();
		return new vec2(
			(tp.x() + this.#_brd.w()/2),
			(tp.y() + this.#_brd.h()/2)
		);
	}
	write_sector=(walls, ceils, tile)=> {
		const ix 	= tile.ips().x();
		const iy 	= tile.ips().y();

		const rbf 	= this.#_geo.rbf();
		const rbd 	= rbf.data();

		const walls_i	= rbf.get_i(ix,iy,0);
		const ceils_i	= rbf.get_i(ix,iy,1);
	
		rbd[walls_i] = walls;
		rbd[ceils_i] = ceils;
	}

	place_sector=(tid, tile, call=null)=> {
// you don't have permission to touch this tile! :(
		if(!tile.perms()) return;
		const ix 	= tile.ips().x();
		const iy 	= tile.ips().y();

		const rbf 	= this.#_geo.rbf();
		const rbd 	= rbf.data();

		const wall_i	= rbf.get_i(ix,iy,0);

		if(rbd[wall_i] == 0) {
			if(call) call();
			rbd[wall_i]  = tid | (tid << 8) | (tid << 16) | (tid << 24);
//			rbd[floor_i] = tid | (tid << 8) | (tid << 16) | (tid << 24);
		}

	}
	remove_sector=(tile, call=null)=> {
// you don't have permission to touch this tile! :(
		if(!tile.perms()) return;
		const ix 	= tile.ips().x();
		const iy 	= tile.ips().y();
		const rbf 	= this.#_geo.rbf();
		const rbd 	= rbf.data();
		const wall_i	= rbf.get_i(ix,iy,0);
		const floor_i	= rbf.get_i(ix,iy,1);
		
		if(rbd[wall_i] != 0) {
			if(call) call();
			rbd[wall_i] = 0;
		}
	}
	paint_sector=(tid,face,tile)=> {
		const ix 	= tile.ips().x();
		const iy 	= tile.ips().y();

		const rbf 	= this.#_geo.rbf();
		const rbd 	= rbf.data();

		if(face < 4) {
			const idx = rbf.get_i(ix,iy,0);
			const bits = (rbd[idx] & ~(0xFF << 8*face)) | ((tid & 0xFF) << 8*face);
			rbd[idx] = bits;

		}else {
			face -= 4;
			const idx = rbf.get_i(ix,iy,1);
			const bits = (rbd[idx] & ~(0xFF << 8*face)) | ((tid & 0xFF) << 8*face);
			rbd[idx] = bits;
		}
	}

	geo=()=>this.#_geo; // used for the renderer
	w=()=>this.#_brd.w();
	h=()=>this.#_brd.h();
	s=()=>this.#_brd.s();
	sample_brd=(x,y)=>this.#_brd.sample(x,y);
	sample_walls=(x,y)=>this.#_geo.wall_at(x,y);
	sample_floors=(x,y)=>this.#_geo.floor_at(x,y);
	sample_til=(i)=>this.#_til.get_obj(i);
}

// GEOMETRY CODE
class GeometryContext {
	#_rbf; #_dim;
	constructor() {}
	bind=(dim)=> {
		this.#_dim = new vec2(~~dim.x(),~~dim.y());
		const w = this.#_dim.x();
		const h = this.#_dim.y();
		this.#_rbf = new BufferUI32_2D(w,h,2);
	}
	dim=()=>this.#_dim;
	rbf=()=>this.#_rbf;
	wall_at=(x,y)=>this.#_rbf.sample(x,y,0);
	floor_at=(x,y)=>this.#_rbf.sample(x,y,1);
}

class TextureContext {
	#_tex2D;
	constructor() {}
	bind=(tex2D)=> {
		this.#_tex2D = tex2D;
	}
	tex2D=()=>this.#_tex2D;
}

const WORLDMENU_FSM = new FSM([{
key:'init',
	setup:function(prev,fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		fsm.cswitch(man, 'edit');
	}
},
{
	key:'edit',
	setup:function(prev,fsm,man) {},
	enter:function(prev,fsm,man) {
		const frm = man.frame;
// concatenate buttons to window
		man.controls = [];
// X DIMENSION

		const limit=(txt)=> {
			const i = parseInt(txt.text);
			if(i > 64) txt.silentSetText('64');
			else if(i < 1) txt.silentSetText('1');
		}

		const xlbl = new P5Label();
		xlbl.text = "Dimension X";

		const xtext = new P5TextBox();
		xtext.onChange=()=>{ limit(xtext); }
		xtext.text = "32";

		xtext.x = xlbl.text.length*8;
		xtext.numOnly = true;
		xtext.acceptFloat = false;
		xlbl.y = xtext.h / 2;

		man.controls.push(xlbl);
		man.controls.push(xtext);
// Y DIMENSION
		const ylbl = new P5Label();
		ylbl.text = "Dimension Y";

		const ytext = new P5TextBox();
		ytext.text = "32";
		ytext.onChange=()=>{ limit(ytext); }
		ytext.x = ylbl.text.length*8;
		ytext.numOnly = true;
		ytext.acceptFloat = false;
		ytext.y = xtext.h + 8;
		ylbl.y = xtext.h + ytext.h / 2 + 4;

		man.controls.push(ylbl);
		man.controls.push(ytext);
// SEED?
		const slbl = new P5Label();
		slbl.text = "Seed?";
		slbl.y = ylbl.y + ytext.h;

		const schk = new P5CheckBox();
		schk.text = "";
		schk.checked = true;
		schk.w = 16;
		schk.h = 16;
		schk.x = xtext.x;
		schk.y = slbl.y - schk.h/4;

		man.controls.push(slbl);
		man.controls.push(schk);

// CREATE
		const but = new P5Button();
		but.text = "Create!";
		but.x = frm.container.w - but.text.length*8 - 32;
		but.y = frm.container.h - but.h - 4;
		but.onClick = () => {
			const dim = new vec2(parseInt(xtext.text), parseInt(ytext.text));
			man.create_world(dim, schk.checked);
		}	

		man.controls.push(but);

		for(const con of man.controls) {
			frm.container.addControl(con);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
}
]);

const MENU_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
// construct { new, load, options }
		const frm = man.frame;
		frm.h = 160;
		man.buttons = [];
		const ics = RES.icons();
		const create_b = new P5Button();
		create_b.text = "New World";
		create_b.w = 32; create_b.h = 32;
		create_b.image = ics['create_world'].img;
		create_b.onClick = () => {
			man.create_menu();
		};	

		const load_b = new P5Button();
		load_b.text = "Load World";
		load_b.w = 32; load_b.h = 32;
		load_b.imageXScale = 0.8;
		load_b.imageYScale = 0.8;
		load_b.image = ics['load_world'].img;
		load_b.onClick = () => {
			if(!man.fp) {
				const fp = createInput();
				fp.attribute('type','file');
				fp.attribute('single','');
				man.fp = fp;

				fp.elt.addEventListener('change', (evt) => {
					if(evt.target.files) {
						const file = evt.target.files[0];
						const reader = new FileReader();
						reader.readAsText(file);
						reader.onload = (e) => {
							const str = e.target.result;
							const json_str = JSON.parse(str);
							man.load_world(json_str);
						}
					}
				}, false);
			}
			man.fp.elt.click();
		};		

		const opt_b = new P5Button();
		opt_b.text = "Options";
		opt_b.w = 32; opt_b.h = 32;
		opt_b.image = ics['options'].img;

		man.buttons.push(create_b);
		man.buttons.push(load_b);
		man.buttons.push(opt_b);

		let pad = 4;
		let iy = pad;
		for(let i = 0;i < man.buttons.length;i++) {
			man.buttons[i].y = iy;
			frm.container.addControl(man.buttons[i]);	
			const lbl = new P5Label();
			lbl.text = man.buttons[i].text;
			lbl.x = 32 + 2*pad;
			lbl.y = iy;

			frm.container.addControl(lbl);
			iy += (man.buttons[i].h + pad);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
}]);

// 3D VIEWPORT CODE
const SCENE_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		const frm = man.frame;

		const cv 	= man.cv().canvas;
		const world = man.world();
		const rto 	= cv.height/cv.width;
		const res_w = 800;

// construct viewcontext
		man.view = new ViewContext(
			new vec2(UNIT*4,UNIT*4),
			new vec2(1,0),
			100,
			new vec2(res_w,res_w*rto),
			2
		);
		
		man.get3Dtransform = () => {
			const vbf = man.view.vbf();
			const vbd = vbf.data();

			return {
				npos: mul2(1/UNIT, man.view.pos()),
				pos: man.view.pos(),
				view: {
					left: new vec2(vbd[0],vbd[1]),
					right: new vec2(vbd[vbd.length-2],vbd[vbd.length-1])
				}
			}
		}

		man.pick3D = (fsm,man) => { this.pick3D(fsm,man); }
		frm.container.onClick = () => {
			if(mouseButton == LEFT) {
				man.pick3D(fsm,man);
			}
		}
		fsm.cswitch(man, 'idle');
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick:function(world,fsm,man) {
// transform
		const v 	= man.view;
		const cv 	= man.cv().canvas;
		const pos	= v.pos();
// z depth
		const zbf 	= v.zbf();
		const zbd	= zbf.data();
// mouse interpolation
		const nmx 	= man.mx() / cv.width;
		const mx	= ~~(nmx * zbf.w()); 
// vector interpolation
		const vbf	= v.vbf();
		const vbd	= vbf.data();
// trace to wall
		const toi 	= LENSD*zbd[mx] + NEAR;

		const dir	= new vec2(
			vbd[2*mx],
			vbd[2*mx+1]	
		);
		const trc 	= new vec2(
			toi*dir.x(),
			toi*dir.y()
		);
// normals
		const nbf	= v.nbf();
		const nbd	= nbf.data();
	
		const nrm = new vec2(
			nbd[3*mx],
			nbd[3*mx+1]
		);

		const hit	= new vec2(
			((pos.x() + trc.x()*UNIT)/UNIT),
			((pos.y() + trc.y()*UNIT)/UNIT)
		);

		let tile = null;
		const fh  = v.fbf().h();
		const ch  = ~~(fh * man.my() / cv.height);
		const rwh = fh/toi; 							// real wall height
		const wh  = Math.min(rwh, fh); 					// wall height to be rendered
		const hh  = wh/2;
		const dh  = Math.floor((fh - wh)/2) + 1; 		// distance to wall height
// ceiling
		if(ch < dh) {
			const lt  = 1/(fh-2*ch);
			const wt  = fh*lt;
			const cx  = pos.x()/UNIT + wt*dir.x();
			const cy  = pos.y()/UNIT + wt*dir.y();

			tile = world.sample_til(world.pos_3D_tile_index(
				add2(mul2(0.5,nrm),new vec2(cx,cy))
			));
			return {
				hit:new vec2(cx,cy),
				nrm:new vec2(0,0),
				toi:toi,
				trc:trc,
				dir:dir,
				tile:tile,
				face:4
			}
// floor
		}else if(ch > dh + wh) {
			const lt  = -1/(fh-2*ch);
			const wt  = fh*lt;
			const cx  = pos.x()/UNIT + wt*dir.x();
			const cy  = pos.y()/UNIT + wt*dir.y();

			tile = world.sample_til(world.pos_3D_tile_index(
				add2(mul2(0.5,nrm),new vec2(cx,cy))
			));
			return {
				hit:new vec2(cx,cy),
				nrm:new vec2(0,0),
				toi:toi,
				trc:trc,
				dir:dir,
				tile:tile,
				face:5
			}
		}
// walls
		else {
			tile = world.sample_til(world.pos_3D_tile_index(
				add2(mul2(0.5,nrm),hit)
			));
			return {
				hit:hit,
				nrm:nrm,
				toi:toi,
				trc:trc,
				dir:dir,
				tile:tile,
				face: (nrm.x()!=0) ? (nrm.x()>0) ? 0 : 1 : (nrm.y()<0)? 2 : 3
			}
		}
	},
	pick3D:function(fsm,man) {
		const world = man.world();
		const pick = this.pick(world,fsm,man);
		const toolkit = man.toolkit().man;
		toolkit.pick3D(pick, world);
	}
},
{
	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const cv = man.cv().canvas;

		const t = man.tex();
		const w = man.world().geo();
		const v = man.view;

		const buf = v.fbf();
		const glc = buf.glc();

		if(man.active()) {
			glc.frameRate(60);
			v.move();
			v.bind(v.pos(),v.fwd(),v.fov());
		}else {
			glc.frameRate(15);
		}

		cv.background(0);
        glc.background(0);
		glc.stroke(255); glc.ellipse(v.pos().x(),0,40,40);
        buf.bind();
        DRAW(v,w,t,UNIT);
        buf.apply();

// dirty fix, not happy. :(
		if(ZOOM > 105) {
        	v.flush2(cv, cv.width/(glc.width),2*cv.height/(glc.height));
		}else {
        	v.flush2(cv, cv.width/(2*glc.width),cv.height/(2*glc.height));
		}

		cv.fill(0,255,0); cv.stroke(0);
		cv.textSize(16);
		cv.textStyle(BOLD);
		cv.text("FOV: " + ~~v.fov(),8,24);
		cv.text("X: " + ~~v.pos().x() + " Y: " + ~~v.pos().y(), 8, 48);
		const vbd = v.vbf().data();
		const fv = new vec2(
			vbd[~~(vbd.length/2)],
			vbd[~~(vbd.length/2) + 1]
		);
		const p2fv = perp2(fv);
		let angle = wangle2(fv) * 180 / Math.PI;
		if(angle < 0) angle += 180;
		cv.text("ANGLE: " + ~~angle, 8, 72);
	},
}]);

// 3D VIEWPORT CODE

// 2D VIEWPORT CODE

// this class will be used to represent the view of the topdown
// viewport.
class TopdownContext {
    #_pos; #_ang; #_scl;
    constructor(pos,ang,scl) {
        this.#_pos = pos;
        this.#_ang = ang;
        this.#_scl = scl;
    }
    bind=(pos,ang,scl)=> {
        this.#_pos = pos;
        this.#_ang = ang;
        this.#_scl = scl;
    }
    move=()=> {
        const dt = deltaTime/1000;
        const sp = 4*Math.sqrt(this.#_scl);
        const dx = keyIsDown(65) ? 1 : keyIsDown(68) ? -1 : 0;
        const dy = keyIsDown(87) ? 1 : keyIsDown(83) ? -1 : 0;
        const ds = keyIsDown(81) ? 1 : keyIsDown(69) ? -1 : 0;
        this.#_scl += ds*dt*this.#_scl;
        this.#_scl = this.#_scl > 4 ? this.#_scl : 4;
        this.#_scl = this.#_scl > 256 ? 256 : this.#_scl;
        this.#_pos = add2(this.#_pos, new vec2(256/sp*dx*dt,256/sp*dy*dt));
    }
    pos=() => this.#_pos;
    ang=() => this.#_ang;
    scl=() => this.#_scl;
}

const TOPDOWN_FSM=new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		const frm = man.frame;

		man.l2w_matrix = new Matrix();	// local to world matrix
// construct topdown canvas context
		man.tv = new TopdownContext(
			new vec2(0,0), 	// origin
			0, 				// rotation
			16				// scale
		);

		man.get_tile = (p) => { return this.get_tile(man,p); }
		man.pick2D = (fsm,man) => { this.pick2D(fsm,man); }
		man.highlight2D = (fsm,man) => { this.highlight2D(fsm,man); }

		fsm.cswitch(man, 'idle');
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick_tile:function(world,fsm,man) {
		const m  = man.l2w_matrix;
		const mp = new vec2(man.mx(),man.my());
   		const o  = m.get2Dorigin(3);

		const v1 = m.get2Dvec(0);
		const v2 = m.get2Dvec(1);

		const dif   = sub2(mp,o);
		const prj1s = proj2s(dif,v1);
		const prj2s = proj2s(dif,v2);

		const proj = new vec2(prj1s,prj2s);
		const m_tile = this.get_tile(man,proj);
		if(m_tile == null) return null;

		const a = m_tile.pos();
// box vertices
		const b = add2(a, new vec2(1,0));
		const c = add2(b, new vec2(0,1));
		const d = add2(c, new vec2(-1,0));
// center of box
		const center = add2(a, new vec2(0.5,0.5));
		const x = sub2(proj,center);
		
		const dirs = [
			new vec2(-1,0),
			new vec2(1,0),
			new vec2(0,1),
			new vec2(0,-1)
		];
		
		const dists = [
			{idx:3, odx: 2, d: proj2s(x,dirs[3]) }, // ab
			{idx:2, odx: 3, d: proj2s(x,dirs[2]) }, // cd
			{idx:1, odx: 0, d: proj2s(x,dirs[1]) }, // bc
			{idx:0, odx: 1, d: proj2s(x,dirs[0]) }, // da
		];
		dists.sort((b,a)=>a.d-b.d);
		const i = dists[0].idx;

		return {
			nrm:dirs[i],
			dis:dists[0].d,
			face:i,
			oface:dists[0].odx,
			hit:proj,
			tile:m_tile
		};
	},
	pick2D:function(fsm,man) {
		const world = man.world();	
		const pick = this.pick_tile(world,fsm,man);
		if(pick == null) return;

		const toolkit = man.toolkit().man;
		toolkit.pick2D(pick, world);
	},
	highlight2D:function(fsm,man) {
		const cv = man.cv().canvas;
		const world = man.world();	
		const pick = this.pick_tile(world,fsm,man);
		if(pick == null) return;

		const toolkit = man.toolkit().man;
		toolkit.highlight2D(pick, world, cv);
	},
	get_tile:function(man,p) {
		const world = man.world();
		const cv 	= man.cv().canvas;
		const w 	= world.w();
		const h 	= world.h();

		if(p.x()<=-w/2||p.x()>=w/2 || p.y()<=-h/2||p.y()>=h/2) return null;
		return world.sample_til(world.pos_2D_tile_index(p));
	}
},
{
	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
// draw grid
		const world = man.world();		// environment we are rendering
		const cv = man.cv().canvas;		// canvas element
		const tv = man.tv;				// topdown context
		if(man.active()) tv.move();
		const of 	= tv.pos(); 		// offset
		const scl 	= tv.scl(); 		// scale
		const m		= man.l2w_matrix;	// local to world matrix
		m.identity();

		cv.background(0);

		cv.resetMatrix(); cv.noFill(); cv.stroke(255);
		cv.strokeWeight(4 / (256 - Math.sqrt(scl)));
// shift to center of screen
		m.translate(cv.width/2,cv.height/2,0);
// scale based on view size
		m.scale(scl);
// translate based on offset after scale!
		m.translate(of.x(),of.y(),0);
// tell p5 canvas to apply matrix transform
		m.applyp5(cv);
		cv.strokeWeight(1/scl); cv.stroke(255,0,0); cv.ellipse(0,0,1,1);
		cv.strokeWeight(8 / (256 - Math.sqrt(scl)));
// draw the 3D viewing frustrum to the scene
		this.draw_frustrums(fsm,man);

// draw the tiles on the screen
		cv.stroke(255); cv.noFill();
		this.draw_tiles(fsm,man);

// clip mouse position so we don't accidentally place a tile
		const mp = new vec2(man.mx(),man.my());
		if(mp.x() < 16 || mp.x() > cv.width - 16) return;
		if(mp.y() < 16 || mp.y() > cv.height - 16) return;

		man.highlight2D(fsm,man);
		if(mouseIsPressed && mouseButton == LEFT) {
			if(!man.active()) return;
			man.pick2D(fsm,man);
		}
	},
	draw_frustrums:function(fsm,man, m) {
		const cv = man.cv().canvas;
		const world = man.world();
		const frustrums = man.get3Dtransforms();
		for(const view_func of frustrums) {
			const frustrum = view_func();
			const p = frustrum.pos;
			const lv = frustrum.view.left;
			const rv = frustrum.view.right;

			const wp = new vec2(
				-world.w()/2 + p.x()/UNIT,
				-world.h()/2 + p.y()/UNIT
			);
			cv.stroke(255,120,20);
// transform from center view to corner view
			cv.ellipse(wp.x(),wp.y(),0.5,0.5);
// draw frustrum
// left
			cv.line(
				wp.x(), wp.y(),
				wp.x() + lv.x(), wp.y() + lv.y()
			);
// right
			cv.line(
				wp.x(), wp.y(),
				wp.x() + rv.x(), wp.y() + rv.y()
			);
// connect
			cv.line(
				wp.x() + rv.x(), wp.y() + rv.y(),
				wp.x() + lv.x(), wp.y() + lv.y()
			);
		}
	},
	draw_tiles:function(fsm,man) {
		const cv = man.cv().canvas;
		const world = man.world();
		for(let i=0;i<world.s();i++) {
			const ix = ~~(i%world.w());
			const iy = ~~(i/world.w());

			if(!world.sample_walls(ix,iy)) continue;
			const idat = world.sample_brd(ix,iy);
			const tile = world.sample_til(idat);
// highlighting 
			if(tile == null) continue;
			tile.draw2D(cv, true);
		}
	}
}]);

// all the tools 
const TOOLBAR_FSM = new FSM([{
	key:'init',
	create_button:function(img,i,pad=36, man, click) {
		const cols = 1;
		const but = new P5Button();
		but.image = img;
		but.text = "";
		but.w = 64; but.h = 64;
		but.x = ~~(pad/cols) + ~~(i % cols)*(pad/2);
		but.y = ~~(pad/cols) + ~~(i / cols)*(but.h + pad/2);

		but.onClick=()=> {
			const fman = man.fman();
			if(man.front != null) {
				fman.bringFormToFront(man.front.frame);
			}
			click();
		}

		return but;
	},
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		const frm = man.frame;
		const fman = man.fman();
		frm.w = 72;
		frm.h = (64+10)*3;
		frm.x = 16;
		frm.y = height - frm.h - 16;

		const ics = RES.icons();
		man.buttons = {};
		man.buttons.brush  = this.create_button(ics['brush_tool'].img, 0, 2, man, () => {
			const ctx = man.ctxmenu();
			const tkt = man.toolkit();
			const tex = man.texmenu();
			ctx.fsm.cswitch(ctx.man, 'brush');
			tex.fsm.cswitch(tex.man, 'close'); // close atlas
			tkt.fsm.cswitch(tkt.man, 'idle'); // default to create
		});
		man.buttons.paint  = this.create_button(ics['paint_tool'].img, 1, 2, man, () => {
			const ctx = man.ctxmenu();
			const tex = man.texmenu();
			const tkt = man.toolkit();
			ctx.fsm.cswitch(ctx.man, 'paint');
	
			tex.man.switch_texture = (id) => {
				tkt.man.switch_texture(id);
			};

			tex.fsm.cswitch(tex.man, 'open'); // open texture atlas
			tkt.fsm.cswitch(tkt.man, 'idle'); // reset toolkit
		});
		man.buttons.entity = this.create_button(ics['load_world'].img, 2, 2, man, () => {
			const data = {
				dim: [ man.world().w(), man.world().h() ],
				r_sectors: man.world().geo().rbf().data()
			}
			saveJSON(data, null, true);
//			var world = new Blob([JSON.stringify(data)], {type:"text/plain;charset=utf-8"});
//			saveAs(world, "world_"+Date.now()+".json");
		});
// append to render list
		for(const i in man.buttons) {
			const obj = man.buttons[i];
			obj.imageXScale = 0.8;
			obj.imageYScale = 0.8;
			frm.container.addControl(obj);
		}

		frm.container.disableSmooth();
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const fman = man.fman();
		let front = null;
// capture the form that is currently active
		const windows = man.windows();
		for(const i in windows) {
			const win = windows[i];
			if(win.frame.isOnTop && win.frame != man.frame) {
				front = win; break;
			}
		}
// active form
		if(front != null) {
			man.front = front;
		}
	}
}]);

const CREATE_TEXTURE_BUTTON=(img,i,tds,man,click)=> {
	const cols = man.cols;
	const pad  = man.texpad;
	const but = new P5Button();
	but.image = img;
	but.text = "";
	but.w = man.texsize; but.h = man.texsize;
	but.imageXScale = 0.8;  but.imageYScale = 0.8;
	but.srcX = tds[i].ox; but.srcY = tds[i].oy;
	but.srcW = tds[i].w;  but.srcH = tds[i].w;
	but.adv_render = true;

	but.x = ~~(pad) + ~~(i % cols)*(but.w + 2*pad);
	but.y = ~~(pad) + ~~(i / cols)*(but.h + 2*pad);

	but.onClick=()=> { click(); }
	return but;
}

const CREATE_BUTTON=(img,i,man,click)=> {
	const cols = man.cols;
	const pad  = man.pad;
	const but = new P5Button();
	but.image = img;
	but.text = "";
	but.w = 64; but.h = 64;
	but.x = ~~(pad) + ~~(i % cols)*(but.w + 2*pad);
	but.y = ~~(pad) + ~~(i / cols)*(but.h + 2*pad);
	but.onClick=()=> {
		click();
	}
	return but;
}

// responsible for handling user input sent via viewports
const TOOLKIT_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		fsm.cswitch(man, 'idle');
		man.texture_id = 1;
		man.switch_texture=(id)=> {
			man.texture_id = id;
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick,world)=>{};
		man.pick3D = (pick,world)=>{};
		man.highlight2D = (tile,world,cv)=>{};
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'brush_create',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick,world) => { 
			this.pick2D(pick,world,fsm,man);
		};
		man.highlight2D = (pick,world,cv) => {
			cv.stroke(255,255,0);
			const tile = pick.tile;
			tile.draw2D(cv);	
		};
		man.pick3D = (pick,world) => {
			this.pick3D(pick,world,fsm,man);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick2D:function(pick,world,fsm,man) {
		world.place_sector(man.texture_id, pick.tile, () => {
			RES.edtsounds().get_sound(~~random(0,7)).sound.play();
		});
	},
	pick3D:function(pick,world,fsm,man) {
		const nrm = pick.nrm;
		const hit = pick.hit;
		const idx = world.pos_3D_tile_index(
			add2(hit,mul2(-0.5,nrm))
		);
		const tile = world.sample_til(idx);
// tile distance test
		const frustrums = man.get3Dtransforms();
		for(const view_func of frustrums) {
			const frustrum = view_func();
			const p = frustrum.npos;
			const tw = world.tile_to_world(tile);
			const df = sub2(p, tw);
// point, rect test
			if(df.x() > 0 && df.x() < 1 &&
			   df.y() > 0 && df.y() < 1) return;
		}
		world.place_sector(man.texture_id, tile, () => {
			RES.edtsounds().get_sound(~~random(0,7)).sound.play();
		});
	}

},
{
	key:'brush_remove',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick, world) => { 
			this.pick2D(pick,world,fsm,man);
		};
		man.highlight2D = (pick,world,cv) => {
			cv.stroke(255,0,0);
			const tile = pick.tile;
			tile.draw2D(cv);	
		};
		man.pick3D = (pick,world)=> {
			this.pick3D(pick,world,fsm,man);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick2D:function(pick,world,fsm,man) {
		world.remove_sector(pick.tile, () => {
			RES.edtsounds().get_sound(~~random(0,7)).sound.play();
		});
	},
	pick3D:function(pick,world,fsm,man) {
		const nrm = pick.nrm;
		const hit = pick.hit;
		const idx = world.pos_3D_tile_index(
			add2(hit,mul2(0.5,nrm))
		);
		const tile = world.sample_til(idx);
		world.remove_sector(tile, ()=> {
			RES.edtsounds().get_sound(~~random(0,7)).sound.play();
		});
	}
},
{
	key:'paint_wall',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick, world) => { 
			this.pick2D(pick,world,fsm,man);
		};
		man.highlight2D = (pick,world,cv) => {
			const tile = pick.tile;
			let ix = tile.ips().x();
			let iy = tile.ips().y();
			if(world.sample_walls(ix,iy)!=0) return;

			const adj_idx = world.pos_2D_tile_index(add2(pick.nrm, pick.hit));
			const adj_tile = world.sample_til(adj_idx);
			if(adj_tile == null) return;

// determine if next tile has walls
			ix = adj_tile.ips().x();
			iy = adj_tile.ips().y();
			if(world.sample_walls(ix,iy)==0) return;

			cv.strokeCap(SQUARE);
			cv.stroke(255,255,0);
			cv.strokeWeight(0.25);

			tile.draw_edge2D(pick.hit, cv);	
		};
		man.pick3D = (pick,world)=> {
			this.pick3D(pick,world,fsm,man);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick2D:function(pick,world,fsm,man) {
		const tile = pick.tile;
		let ix = tile.ips().x();
		let iy = tile.ips().y();

// only paint along edges of sectors that are empty.
		if(world.sample_walls(ix,iy)!=0) return;

		const adj_idx = world.pos_2D_tile_index(add2(pick.nrm, pick.hit));
		const adj_tile = world.sample_til(adj_idx);
		if(adj_tile == null) return;

// determine if next tile has walls
		ix = adj_tile.ips().x();
		iy = adj_tile.ips().y();
		if(world.sample_walls(ix,iy)==0) return;

		world.paint_sector(man.texture_id,pick.oface,adj_tile);
	},
	pick3D:function(pick,world,fsm,man) {
		const nrm = pick.nrm;
		const hit = pick.hit;
		const idx = world.pos_3D_tile_index(
			add2(hit,mul2(0.5,nrm))
		);
		const tile = world.sample_til(idx);
		world.paint_sector(man.texture_id,pick.face,tile);
	}
},
{
	key:'paint_ceil',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick, world) => { 
			this.pick2D(pick,world,fsm,man);
		};
		man.highlight2D = (pick,world,cv) => {
			cv.strokeCap(SQUARE);
			cv.stroke(255,255,0);
			cv.strokeWeight(0.25);

			const tile = pick.tile;
			tile.draw2D(cv);
		};
		man.pick3D = (pick,world)=> {
			this.pick3D(pick,world,fsm,man);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick2D:function(pick,world,fsm,man) {
		const tile = pick.tile;
		world.paint_sector(man.texture_id,4,tile);
	},
	pick3D:function(pick,world,fsm,man) {
		const nrm = pick.nrm;
		const hit = pick.hit;
		const idx = world.pos_3D_tile_index(
			add2(hit,mul2(0.5,nrm))
		);
		const tile = world.sample_til(idx);
		world.paint_sector(man.texture_id,pick.face,tile);
	}

},
{
	key:'paint_floor',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick, world) => { 
			this.pick2D(pick,world,fsm,man);
		};
		man.highlight2D = (pick,world,cv) => {
			cv.strokeCap(SQUARE);
			cv.stroke(255,255,0);
			cv.strokeWeight(0.25);

			const tile = pick.tile;
			tile.draw2D(cv);
		};
		man.pick3D = (pick,world)=> {
			this.pick3D(pick,world,fsm,man);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {},
	pick2D:function(pick,world,fsm,man) {
		const tile = pick.tile;
		world.paint_sector(man.texture_id,5,tile);
	},
	pick3D:function(pick,world,fsm,man) {
		const nrm = pick.nrm;
		const hit = pick.hit;
		const idx = world.pos_3D_tile_index(
			add2(hit,mul2(0.5,nrm))
		);
		const tile = world.sample_til(idx);
		world.paint_sector(man.texture_id,pick.face,tile);
	}
},
{
	key:'create_entity',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.pick2D = (pick,world) => { 
			this.pick2D(pick,world,fsm,man);
		};
		man.highlight2D = (pick,world,cv) => {
			cv.stroke(255,255,0);
			const tile = pick.tile;
			tile.draw2D(cv);	
		};
		man.pick3D = (pick,world) => {
			this.pick3D(pick,world,fsm,man);
		}
	},
	pick2D:function(pick,world,fsm,man) {
		world.place_sector(man.texture_id, pick.tile);
	},
	pick3D:function(pick,world,fsm,man) {
		const nrm = pick.nrm;
		const hit = pick.hit;
		const idx = world.pos_3D_tile_index(
			add2(hit,mul2(-0.5,nrm))
		);
		const tile = world.sample_til(idx);
// tile distance test
		const frustrums = man.get3Dtransforms();
		for(const view_func of frustrums) {
			const frustrum = view_func();
			const p = frustrum.npos;
			const tw = world.tile_to_world(tile);
			const df = sub2(p, tw);
// point, rect test
			if(df.x() > 0 && df.x() < 1 &&
				df.y() > 0 && df.y() < 1) return;
		}
		world.place_sector(man.texture_id, tile);
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
}]);

const CONTEXT_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
// clear out all the controls
		man.controls = {};
		man.cols = 2;
		man.pad = 3;

	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		const frm = man.frame;
		const fman = man.fman();
		fsm.cswitch(man, 'idle');
	}
},
{
	key:'idle',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'brush',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		if(prev=='brush') return;
		const frm = man.frame;
		const tkt = man.toolkit();
		frm.container.removeAllControls();
		man.controls = {};
		man.fman().closeForm(frm);
		frm.title = "Context Menu (Brush)";
		frm.w = (64+8)*2;
		frm.h = 96;
		frm.x = 100;
		frm.y = height - 120;

		const ics = RES.icons();
		man.controls.create = CREATE_BUTTON(ics['brush_create'].img, 0, man, ()=> {
			tkt.fsm.cswitch(tkt.man, "brush_create");
		});
		man.controls.remove = CREATE_BUTTON(ics['brush_remove'].img, 1, man, ()=> {
			tkt.fsm.cswitch(tkt.man, "brush_remove");
		});
// BUG: If you insert a control into a frame AFTER a container has been positioned,
// the control's absolute values will not be updated.
		for(const i in man.controls) {
			const obj = man.controls[i];
			obj.imageXScale = 0.8; obj.imageYScale = 0.8;
			frm.container.addControl(obj);
		}

		const fman = man.fman();
		fman.showForm(frm);

	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'paint',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		if(prev=='paint') return;
		const frm = man.frame;
		const tkt = man.toolkit();

		man.cols = 3;
		frm.container.removeAllControls();
		man.fman().closeForm(frm);
		man.controls = {};
		frm.title = "Context Menu (Paint)";
		frm.w = (64+8)*3;
		frm.h = 96;
		frm.x = 100;
		frm.x = 100;
		frm.y = height - 120;

		const ics = RES.icons();
		man.controls.wall = CREATE_BUTTON(ics['paint_wall'].img, 0, man, ()=> {
			tkt.fsm.cswitch(tkt.man, "paint_wall");
		});
		man.controls.ceil = CREATE_BUTTON(ics['paint_ceil'].img, 1, man, ()=> {
			tkt.fsm.cswitch(tkt.man, "paint_ceil");
		});
		man.controls.floor = CREATE_BUTTON(ics['paint_floor'].img, 2, man, ()=> {
			tkt.fsm.cswitch(tkt.man, "paint_floor");
		});
// default to paint wall
		tkt.fsm.cswitch(tkt.man, "paint_wall");

// BUG: If you insert a control into a frame AFTER a container has been positioned,
// the control's absolute values will not be updated.
		for(const i in man.controls) {
			const obj = man.controls[i];
			frm.container.addControl(obj);
		}

		man.fman().showForm(frm);
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'entity',
	setup:function(prev,fsm,man) {},
	enter:function(prev,fsm,man) {
		if(prev=='entity') return;
		const frm = man.frame;
		frm.container.removeAllControls();	
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
}]);

const TEXTURE_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.init = false;
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'open',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		if(prev == 'open') return; // already initialized
	 	const frm = man.frame;
		const tds = RES.tex2D().tds();
		frm.container.removeAllControls();
		man.controls = {};
		man.fman().closeForm(frm);

		man.cols = tds.length;
		man.texpad = 3;
		man.texsize = 64;

		if(!man.init) {
			frm.title = "Texture Atlas";
			frm.w = man.cols * (man.texsize + man.texpad*2) + man.texpad;
			frm.h = man.texsize * 3/2;
			frm.x = 100;
			frm.y = height - 240;
		}

		man.init = true;

		const tex = RES.tex2D().img();
		for(let i = 0;i < tds.length;i++) {
			man.controls[tds[i].name]=CREATE_TEXTURE_BUTTON(tex, tds[i].id, tds, man, ()=> {
// contact toolkit, swap texture ids
				man.switch_texture(tds[i].id);
			});
		}

		for(const c in man.controls) {
			const obj = man.controls[c];
			frm.container.addControl(obj);
		}

		const fman = man.fman();
		fman.showForm(frm);
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
},
{
	key:'close',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {}
}]);

// RESOURCES CODE
class Resources {
	#_edtsounds;
	#_trcks;
	#_jedt;
	#_jgme;
	#_jlvl;
	#_tex2D;
	#_spr2D;
	#_ics;
	constructor() {	
// LOAD EDITOR DATA
		loadJSON('json/edt_dat.json', (jedt)=> {
			this.#_jedt = jedt;
// LOAD ICONS
			const icons = jedt.resources.icons;
			for(const obj in icons) {
				icons[obj].img = loadImage(icons[obj].path);
			}
			this.#_ics = icons;
// LOAD SOUNDS
			this.#_edtsounds = new Soundsampler();
			this.construct_soundsampler(jedt.resources.sounds, (soundobj) => {
				soundobj.sound.setVolume(0.05);
				this.#_edtsounds.add_sound(soundobj);
			});
		});

// LOAD LEVEL DATA
		loadJSON('json/lvl_dat.json', (jlvl)=> {
			this.#_jlvl = jlvl;
// LOAD TEXTURE DATA
			const geo = this.#_jlvl.geometry_dat;
			this.construct_sampler2D(geo.tex_dat, (sam, img)=> {
				this.#_tex2D = sam;
			});
		});
	}
	construct_sampler2D=(texd,assgn)=> {
		const imgfp = texd.imgfp;
		loadImage(imgfp, (imgdata)=> {
			assgn(new Sampler2D(texd.tds, imgdata), imgdata);
		});
	}
	construct_soundsampler=(sounds, assgn)=> {
		for(const ds of sounds) {
			loadSound(ds.path, (sound)=> {
				assgn({id:ds.id,name:ds.name,path:ds.path,sound:sound});
			});
		}
	}
	edtsounds=()=>this.#_edtsounds;
	tex2D=()=>this.#_tex2D;
	icons=()=>this.#_ics;
}

let RES;

// RESOURCES CODE
let formManager;

const CREATE_TOOLKIT=(man)=> {
	const tfsm = TOOLKIT_FSM;
	const tman = CONSTRUCTOR_MAN();

	tman.fman = () => { return formManager; }
	tman.windows = () => { return sman.windows; }

	tman.world = () => { return sman.world; }
	tman.tex = () => { return sman.tex; }

	tfsm.setup(tman);
	tfsm.set(tman, 'init');

	return { fsm:tfsm, man:tman };
}

const CREATE_CONTEXTMENU_WIN=(sman)=> {
	const ctx_f = new P5Form();
	ctx_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	ctx_f.removeWindowIcon(WND_MINIMIZE_ICON);
	ctx_f.removeWindowIcon(WND_CLOSE_ICON);
	ctx_f.enableResizing = false;
	ctx_f.enableDragging = true;
	ctx_f.title = "Context Menu";
	ctx_f.container.backColor = color(255,255,230);

// initialize to a zero window
	ctx_f.x = 0; ctx_f.y = 0;
	ctx_f.w = 0; ctx_f.h = 0;

	const wfsm = CONTEXT_FSM;
	const wman = CONSTRUCTOR_MAN();

	wman.fman = () => { return formManager; }
	wman.windows = () => { return sman.windows; }

	wman.mx = () => { return ctx_f.mouseX; }		// relative mouse X
	wman.my = () => { return ctx_f.mouseY; }		// relative mouse Y
	wman.active = () => { return ctx_f.isOnTop; }	// is active window
	wman.world = () => { return sman.world; }		// world context
	wman.tex = () => { return sman.tex; }			// texture context
	wman.toolkit = () => { return sman.toolkit; }	// toolkit to notify
	wman.frame = ctx_f;								// context frame

// initialize state
	wfsm.setup(wman);
	wfsm.set(wman, 'init');
// window object
	return { frame:ctx_f, fsm:wfsm, man:wman };
}

const CREATE_TEXTUREMENU_WIN=(sman)=> {
	const ctx_f = new P5Form();
	ctx_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	ctx_f.removeWindowIcon(WND_MINIMIZE_ICON);
	ctx_f.removeWindowIcon(WND_CLOSE_ICON);
	ctx_f.enableResizing = false;
	ctx_f.enableDragging = true;
	ctx_f.title = "Texture Menu";
	ctx_f.container.backColor = color(230,255,255);

// initialize to a zero window
	ctx_f.x = 0; ctx_f.y = 0;
	ctx_f.w = 0; ctx_f.h = 0;

	const wfsm = TEXTURE_FSM;
	const wman = CONSTRUCTOR_MAN();

	wman.fman = () => { return formManager; }
	wman.windows = () => { return sman.windows; }

	wman.mx = () => { return ctx_f.mouseX; }		// relative mouse X
	wman.my = () => { return ctx_f.mouseY; }		// relative mouse Y
	wman.active = () => { return ctx_f.isOnTop; }	// is active window
	wman.world = () => { return sman.world; }		// world context
	wman.tex = () => { return sman.tex; }			// texture context
	wman.toolkit = () => { return sman.toolkit; }	// toolkit to notify
	wman.frame = ctx_f;								// context frame

// initialize state
	wfsm.setup(wman);
	wfsm.set(wman, 'init');
// window object
	return { frame:ctx_f, fsm:wfsm, man:wman };
}

// responsible for creating the toolbar object that houses all the tools
const CREATE_TOOLBAR_WIN=(sman)=> {
	const bar_f = new P5Form();
// disable window toolbar actions
	bar_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	bar_f.removeWindowIcon(WND_MINIMIZE_ICON);
	bar_f.removeWindowIcon(WND_CLOSE_ICON);
// keep the toolbar fixed size
	bar_f.enableResizing = false;
	bar_f.enableDragging = false;
	bar_f.title = "Tools";
	bar_f.container.backColor = color(255,230,230);

	const wfsm = TOOLBAR_FSM;
	const wman = CONSTRUCTOR_MAN();

// give the toolbar permissions to modify the context menu
	wman.ctxmenu = () => { return sman.ctxmenu; }
// give the toolbar access to the form manager so it can
// reassign which window is active
	wman.fman = () => { return formManager; }
	wman.windows = () => { return sman.windows; }

	wman.mx = () => { return bar_f.mouseX; } 			// relative mouse X
	wman.my = () => { return bar_f.mouseY; } 			// relative mouse Y
	wman.active = () => { return bar_f.isOnTop; }		// is window active?
	wman.world = () => { return sman.world; }			// world context to operate on
	wman.tex = () => { return sman.tex; }				// texture context
	wman.frame = bar_f;									// p5frame
	wman.toolkit = () => { return sman.toolkit; }		// access to the toolkit

// initialize state
	wfsm.setup(wman);
	wfsm.set(wman, 'init');
// window bundle
	return { frame:bar_f, fsm:wfsm, man:wman };
}

// responsible for instancing a 3d viewport object
const CREATE_SCENE_WIN=(sman)=> {
	const scn_f = new P5Form();
// arbitrary scaling, don't think much about this
	scn_f.w = width/1.8; scn_f.h = scn_f.w *12/16 + 8;
	scn_f.x = width - scn_f.w - 16;
	scn_f.y = 8;
// removing functionality of window object
	scn_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	scn_f.removeWindowIcon(WND_CLOSE_ICON);
	scn_f.title = "3D Viewport";
	scn_f.container.backColor = color(230,230,255);

// p5 container that will be housed in our new frame
	const scn_c = new P5Canvas();
	scn_c.canvasRenderer = P2D;
	scn_c.w = scn_f.w - 16;
	scn_c.h = scn_f.h - 32;
	scn_c.y = 4;
// resize callbacks to resize canvas
	scn_f.onResize=()=> {
		scn_f.w = ~~(1+(scn_f.w/16))*16;
		scn_f.h = ~~(1+(scn_f.h/16))*16;
		scn_c.w = scn_f.w - 16;
		scn_c.h = scn_f.h - 32;
		scn_c.y = 4;
	}

// enlist the canvas onto the frame
	scn_f.container.addControl(scn_c);

// construct our bundle of state and data
	const wfsm = SCENE_FSM;
	const wman = CONSTRUCTOR_MAN();

	wman.cv = () => { return scn_c };				// p5 canvas object
	wman.mx = () => { return scn_c.mouseX; }		// relative mouse X
	wman.my = () => { return scn_c.mouseY; }		// relative mouse Y
	wman.active = () => { return scn_f.isOnTop; }	// is window active?
	wman.world = () => { return sman.world; }		// world context to write/read to
	wman.tex = () => { return sman.tex; }			// texture context to operate on
	wman.toolkit = () => { return sman.toolkit; }	// toolkit bundle to send inputs to
	wman.frame = scn_f;								// give this window access to the frame

// initialize state machine bundle
	wfsm.setup(wman);
	wfsm.set(wman, 'init');
// window object
	return { frame:scn_f, canvas:scn_c,fsm:wfsm, man:wman };
}

// Constructs a P5Frame bundle that represents
// the topdown viewport code:
const CREATE_2DVIEWPORT_WIN=(sman)=> {
	const map_f = new P5Form();
	map_f.w = width/2.4; map_f.h = height/1.6;
	map_f.x = 8;
	map_f.y = 8;
// disable maximize and removal functionality
	map_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	map_f.removeWindowIcon(WND_CLOSE_ICON);

	map_f.title = "2D Viewport";
	map_f.container.backColor = color(230,255,230);

// construct a canvas renderer for the
// p5Container to display itself to
	const map_c = new P5Canvas();
	map_c.canvasRenderer = P2D;
	map_c.w = map_f.w - 16;
	map_c.h = map_f.h - 32;
	map_c.y = 4;

// resize canvas elements in the event the decides to
// user resizes the canvas
	map_f.onResize=()=> {
		map_f.w = ~~(1+(map_f.w/16))*16;
		map_f.h = ~~(1+(map_f.h/16))*16;
		map_c.w = map_f.w - 16;
		map_c.h = map_f.h - 32;
		map_c.y = 4;
	}

	map_f.container.addControl(map_c);

	const wfsm = TOPDOWN_FSM;
	const wman = CONSTRUCTOR_MAN();

// assign function listeners for the viewport to
// take advantage of 
	wman.cv = () => { return map_c };					// p5container object reference
	wman.mx = () => { return map_c.mouseX; }			// mouse x coordinate relative to window
	wman.my = () => { return map_c.mouseY; }			// mouse y coordinate relative to window
	wman.active = () => { return map_f.isOnTop; }		// are we active?
	wman.world = () => { return sman.world; }			// the world context!
	wman.tex = () => { return sman.tex; }				// texture context to read from
	wman.toolkit = () => { return sman.toolkit; }		// toolkit bundle to send data to
	wman.frame = map_f;

// notify the state machine for the 2D viewport and default to init
	wfsm.setup(wman);
	wfsm.set(wman, 'init');

// context object that our screen handler will bundle into a 'window'
	return { frame:map_f, canvas:map_c, fsm:wfsm, man:wman };
}

const CREATE_WORLDMENU_WIN=(sman)=> {
	const world_f = new P5Form();
	world_f.w = 240; world_f.h = 120;
	world_f.x = width/2 - world_f.w/2;
	world_f.y = height/2 + 48;

	world_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	world_f.removeWindowIcon(WND_MINIMIZE_ICON);
	world_f.enableDragging = false;
	world_f.enableResizing = false;
	world_f.title = "World Parameters";
	world_f.container.backColor = color(50,115,50);

// construct our bundle of state and data
	const wfsm = WORLDMENU_FSM;
	const wman = CONSTRUCTOR_MAN();

	wman.mx = () => { return world_f.mouseX; }		// relative mouse X
	wman.my = () => { return world_f.mouseY; }		// relative mouse Y
	wman.active = () => { return world_f.isOnTop; }	// is window active?
	wman.world = () => { return sman.world; }		// world context to write/read to
	wman.frame = world_f;							// give this window access to the frame

// initialize state machine bundle
	wfsm.setup(wman);
	wfsm.set(wman, 'init');
// window object
	return { frame:world_f, fsm:wfsm, man:wman };
}

// responsible for instancing a 3d viewport object
const CREATE_MENU_WIN=(sman)=> {
	const menu_f = new P5Form();
// arbitrary scaling, don't think much about this
	menu_f.w = 240; menu_f.h = 240;
	menu_f.x = width/2 - menu_f.w/2;
	menu_f.y = height/2 - menu_f.h/2;

// removing functionality of window object
	menu_f.removeWindowIcon(WND_MAXIMIZE_ICON);
	menu_f.removeWindowIcon(WND_MINIMIZE_ICON);
	menu_f.enableDragging = false;
	menu_f.enableResizing = false;
	menu_f.removeWindowIcon(WND_CLOSE_ICON);
	menu_f.title = "World Menu";
	menu_f.container.backColor = color(50,50,115);

// construct our bundle of state and data
	const wfsm = MENU_FSM;
	const wman = CONSTRUCTOR_MAN();

	wman.mx = () => { return menu_f.mouseX; }		// relative mouse X
	wman.my = () => { return menu_f.mouseY; }		// relative mouse Y
	wman.active = () => { return menu_f.isOnTop; }	// is window active?
	wman.world = () => { return sman.world; }		// world context to write/read to
	wman.frame = menu_f;							// give this window access to the frame

// initialize state machine bundle
	wfsm.setup(wman);
	wfsm.set(wman, 'init');
// window object
	return { frame:menu_f, fsm:wfsm, man:wman };

}

let VOLUME_AMOUNT;
function changeVolume(el) {
	VOLUME_AMOUNT = el.value;
	outputVolume(VOLUME_AMOUNT/100);
	localStorage.setItem("VOLUME", VOLUME_AMOUNT);
}

const SCREEN_FSM = new FSM([{
	key:'init',
	setup:function(fsm,man) {
		const tempVOL = window.localStorage.getItem("VOLUME", VOLUME_AMOUNT);
		if(tempVOL != null) VOLUME = float(tempVOL);
		else { 
			VOLUME_AMOUNT= 10;
			outputVolume(VOLUME_AMOUNT/100);
		}

// p5 canvas setup
		man.canvas = createCanvas(
			windowWidth*.95,
			windowHeight*.95,
			P2D
		);
		man.canvas.id("p5canvas");
		man.canvas.parent("#center_flexbox");

// only block scroll if mouse is not in view
		man.active = true;
		man.canvas.mouseOut(()=>{man.active=false;});
		man.canvas.mouseOver(()=>{man.active=true;});

		man.mouseWheel = (delta) => {
			if(man.active) return false;
			else return true;
		};

// world setup
		man.world = new WorldContext();
// texture setup
		man.tex	= new TextureContext();
		man.tex.bind(RES.tex2D());
// window pane initialization

		man.toolkit = CREATE_TOOLKIT(man);
		man.ctxmenu = CREATE_CONTEXTMENU_WIN(man);	// context menu
		man.texmenu = CREATE_TEXTUREMENU_WIN(man);	// texture window
// give toolkit access to texture menu

		man.toolbar = CREATE_TOOLBAR_WIN(man);
		man.toolbar.man.texmenu = () => { return man.texmenu; }

		man.windows = [];
		man.windows.push(man.ctxmenu);
		man.windows.push(man.toolbar);
		man.windows.push(man.texmenu);

// viewports come later
		const SCENE_2D = CREATE_2DVIEWPORT_WIN(man);
		const SCENE_3D = CREATE_SCENE_WIN(man);

		man.windows.push(SCENE_2D);
		man.windows.push(SCENE_3D);

		const get3Dtransforms = () => {
			const frustrums = [];
			for(win of man.windows) {
				if(win.fsm && win.fsm == SCENE_FSM) {
					frustrums.push(win.man.get3Dtransform);
				}
			}
			return frustrums;
		}

// don't activate scene just yet, wait for a context switch to do
// so.
		const active_scene=(man) => {
			for(win of man.windows) {
				formManager.showForm(win.frame);
			}
			formManager.bringFormToFront(man.windows[3].frame); // make sure scene window is on top first
			noCursor();
			man.cursor = new P5Cursor();
		}

// give 2D scene view access to 3d view's transform
		SCENE_2D.man.get3Dtransforms = get3Dtransforms;
// give toolkit access to 3d view's transform
		man.toolkit.man.get3Dtransforms = get3Dtransforms;
	},
	enter:function(prev,fsm,man) {},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
// after first frame, context switch to menu
		fsm.cswitch(man, 'menu');
	}
},
{
	key:'menu',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		man.menu = CREATE_MENU_WIN(man);
		man.world_menu = CREATE_WORLDMENU_WIN(man);
		man.world_menu.frame.onClose = () => {
			const idx = man.windows.indexOf(man.world_menu);
			if(idx >= 0) {
				man.windows[idx] = man.windows[man.windows.length-1];
				man.windows.pop();
			}
		}
// launches parameter menu
		man.menu.man.create_menu=()=> {
// if we are already open
			if(man.windows.indexOf(man.world_menu) >= 0) return;
			formManager.showForm(man.world_menu.frame);
			man.windows.push(man.world_menu);
		}

		man.menu.man.load_world=(level)=> {
			const dim = level.dim;
			const r_sectors = level.r_sectors;
			if(!dim || !r_sectors) return false;
			if(Number.isInteger(dim[0]) && Number.isInteger(dim[1])) {
				let dx = dim[0];
				let dy = dim[1];
				if(dx < 0) dx = 1; else if(dx > 64) dx = 64;
				if(dy < 0) dy = 1; else if(dy > 64) dy = 64;
				if(r_sectors.length > dx*dy) return false;
				man.world.bind(new vec2(dx,dy));
				for(let i = 0;i < man.world.s();i++) {
					const ix = i % dx;
					const iy = ~~(i / dx);
					
					const idat = man.world.sample_brd(ix,iy);
					if(idat != 0) {
						const til = man.world.sample_til(idat);
						man.world.write_sector(r_sectors[i], r_sectors[i + dx*dy], til);
					}
				}
				formManager.closeForm(man.world_menu.frame);
				fsm.cswitch(man, 'edit');
				return true;
			}
		}
		man.world_menu.man.create_world=(dim, type)=> {
			formManager.closeForm(man.world_menu.frame);
			const turbulence=(x,y,f=1., iterat=16) => {
				let t = 0; let = f = 1.;
				for (let i = 0 ; i < iterat ; i++) {
					t += Math.abs(noise(f * x, f * y)) / f;
					f *= 2.;
				}
				return t;
			}
			const tex = man.tex.tex2D();
			const dirt_tid = tex.tds().filter(tid => tid.name == "dirt_0")[0].id;
			const stone_tid = tex.tds().filter(tid => tid.name == "stone_5")[0].id;

// instance world context
			man.world.bind(dim);
// fill all ceilings and floors
			for(let i = 0;i < man.world.s();i++) {
				const ix = i % man.world.w();
				const iy = ~~(i / man.world.w());
				const idat = man.world.sample_brd(ix,iy);
				if(idat != 0) {
					const tile = man.world.sample_til(idat);
					man.world.paint_sector(dirt_tid, 4, tile);
					man.world.paint_sector(dirt_tid, 5, tile);
				}
			}
			if(!type) {
				fsm.cswitch(man, 'edit');
				return; // is seed enabled?
			}
// place random sectors of dirt
			const stone_passes = 3;
			const dirt_passes = 4;

			const stone_thresh = 0.6;
			const dirt_thresh = 0.75;

			let offsx = 0; let offsy = 0;

			const place = (tid,x,y) => {
				const idat = man.world.sample_brd(x,y);
				if(idat != 0) {
					const tile = man.world.sample_til(idat);
					man.world.place_sector(tid, tile);
				}
			}
// seeding dirt
			for(let i = 0;i < dirt_passes;i++) {
				for(let j = 0;j < man.world.s();j++) {
					const ix = j % man.world.w();
					const iy = ~~(j / man.world.w());

					let noi = turbulence(ix + offsx,iy + offsy, 1, 16);
					if(noi < dirt_thresh) place(dirt_tid, ix,iy);
				}
				offsx = random(); offsy = random();
			}
// seeding stone
			for(let i = 0;i < stone_passes;i++) {
				for(let j = 0;j < man.world.s();j++) {
					const ix = j % man.world.w();
					const iy = ~~(j / man.world.w());
					let noi = turbulence(ix + offsx,iy + offsy, 2);
					if(noi < stone_thresh) place(stone_tid, ix, iy);
				}
				offsx = random(); offsy = random();
			}

			fsm.cswitch(man, 'edit');
		};	
		formManager.showForm(man.menu.frame);
// directly enable the main load menu frame
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
// only update the menu
		const mwin = man.menu;
		mwin.fsm.pulse(mwin.man);
// only update world menu (if open)
		const wmwin = man.world_menu;
		if(wmwin) wmwin.fsm.pulse(wmwin.man);
	}
},
{
	key:'edit',
	setup:function(fsm,man) {},
	enter:function(prev,fsm,man) {
		formManager.closeForm(man.menu.frame);
		const idx = man.windows.indexOf(man.menu);
		if(idx >= 0) {
			man.windows[idx] = man.windows[man.windows.length-1];
			man.windows.pop();
		}

		for(const win of man.windows) {
			if(win.frame == man.menu.frame) continue;
			formManager.showForm(win.frame);
		}
	},
	exit:function(next,fsm,man) {},
	pulse:function(fsm,man) {
		for(const win of man.windows) {
			win.fsm.pulse(win.man);
		}
	}
}]);

const SCREEN_ENTITY = {
	fsm:SCREEN_FSM,
	man:CONSTRUCTOR_MAN()
}

function preload() {
	formManager = new P5FormManager();
	RES = new Resources();
}

function mouseWheel(delta) {
	if(SCREEN_ENTITY) return SCREEN_ENTITY.man.mouseWheel(delta);
	else return true;
}

function setup() {
	const zoom = Math.round((window.outerWidth/window.innerWidth)*100);
	ZOOM = zoom;
	SCREEN_ENTITY.man.cv = () => { return map_c };
	SCREEN_ENTITY.man.mx = () => { return map_c.mouseX; }
	SCREEN_ENTITY.man.my = () => { return map_c.mouseY; }

	SCREEN_ENTITY.fsm.setup(SCREEN_ENTITY.man);
	SCREEN_ENTITY.fsm.set(SCREEN_ENTITY.man, 'init');
}

function draw() {
	background(30);
// do render stuff
	SCREEN_ENTITY.fsm.pulse(SCREEN_ENTITY.man);
	formManager.renderForms();
// render cursor on top
	if(SCREEN_ENTITY.man.cursor) {
		SCREEN_ENTITY.man.cursor.render();
	}
}

function keyPressed() { formManager.keyPressed(); }
function keyReleased() { formManager.keyReleased(); }
