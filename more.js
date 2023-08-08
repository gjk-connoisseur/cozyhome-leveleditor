///// BASIC COLLISION /////
const POINT_AABB_OVERLAP=(p,a)=> {
	const amin = a.min();
	const amax = a.max();
	return amin.x() <= p.x() &&
		   amax.x() >= p.x() &&
		   amin.y() <= p.y() &&
		   amax.y() >= p.y();
}
// AABB help from: https://noonat.github.io/intersect/#aabb-vs-aabb
// and https://studiofreya.com/3d-math-and-physics/simple-aabb-vs-aabb-collision-detection/
const AABB_AABB_OVERLAP=(a, b)=> {
// unpack
	const amin = a.min();
	const amax = a.max();

	const bmin = b.min();
	const bmax = b.max();

	const aminx = amin.x();
	const amaxx = amax.x();
	
	const aminy = amin.y();
	const amaxy = amax.y();

	const bminx = bmin.x();
	const bmaxx = bmax.x();
	
	const bminy = bmin.y();
	const bmaxy = bmax.y();

	return aminx <= bmaxx &&
		   amaxx >= bminx &&
		   aminy <= bmaxy &&
		   amaxy >= bminy;
}
class AABB {
	#_p1; #_p2; // vec2s
	constructor() {}
	bind(p1,p2) {
		const minx = p1.x() > p2.x() ? p2.x() : p1.x();
		const maxx = p1.x() > p2.x() ? p1.x() : p2.x();
		const miny = p1.y() > p2.y() ? p2.y() : p1.y();
		const maxy = p1.y() > p2.y() ? p1.y() : p2.y();
// assign endpoints
		this.#_p1 = new vec2(minx,miny);
		this.#_p2 = new vec2(maxx,maxy);
	}
	min=()=> this.#_p1;
	max=()=> this.#_p2;
	dbg=()=> {
		const mn = this.min();
		const mx = this.max();
		rect(mn.x(),mn.y(),mx.x()-mn.x(),mx.y()-mn.y());
	}
}
///// INPUTS /////

// associates input maps to durational signals
class BufferedInput {
	#_nt; #_im; #_act; #_p; #_ct; #_bv;
	constructor(im,p) {
		this.#_im   = im; 		 // input mapper
		this.#_nt   = 0;  		 // next time
		this.#_p    = p;  		 // priority
		this.#_ct   = 0;  		 // capture time
		this.#_bv   = im.dead(); // buffered value
		this.#_act  = false; 	 // is active
	}
// this is with respect to a time signature and a number line
	rhythm=(t, c, e, onlate)=> { // time position, duration, epsilon
		const im = this.#_im;
		const evl = im.eval();
		if(evl != im.dead()) {
			const fence = c*(1+Math.floor(t/c));
			const early = t > fence - e;
			const late =  t < fence + e;
			if(early) {
				this.#_act = true;
				this.#_bv  = evl;
				return;
			}
			if(late && onlate != null) {
				this.#_act = true;
				this.#_bv  = evl;
				onlate();
				return;
			}
		}
	}
	clear=()=> {
		const im   = this.#_im;
		this.#_bv  = im.dead();
		this.#_act = false;
	}
// standard capture (without rhythm)
	capture=(et, dt)=> {
		const im = this.#_im;
		const evl = im.eval();
		if(this.#_act) {
			if(et > this.#_nt) {
				this.#_act = false;		// we are no longer active.
				this.#_bv  = im.dead(); // after toggling, reset to dead.	
			}
		}else {
// set to toggle. begin countdown.
			if(evl != im.dead()) {
				this.#_act 	= true; 		// we are active.
				this.#_ct 	= this.#_nt;	// set capture time
				this.#_nt 	+= dt;			// set next time
				this.#_bv   = evl;			// set buffered value
			}
		}
	}
	bval=()=>this.#_bv;
	act=()=>this.#_act;
	captime=()=>this.#_ct;
	priority=()=>this.#_p;
}
// maps signals to real numbers
class InputMap {
	#_pk; #_nk; #_pv; #_nv; #_dv; #_lv; #_h;
	constructor(pk,nk,pv,nv,dv,h=false) {
		this.#_pk=pk; // positive keycode
		this.#_nk=nk; // negative keycode
		this.#_pv=pv; // positive value
		this.#_nv=nv; // negative value
		this.#_dv=dv; // dead value
		this.#_lv=dv; // last value
		this.#_h = h; // can we be continuously held down?
	}
	eval=()=> {
		let vl = this.#_dv;
		if(this.down(this.#_pk) && !this.down(this.#_nk)) vl = this.#_pv;
		if(!this.down(this.#_pk) && this.down(this.#_nk)) vl = this.#_nv;
// check for holding down
		if(this.#_h) {
			return vl;
		}else {
			if(vl != this.dead() && vl == this.#_lv) vl = this.dead();
			else this.#_lv = vl;
		}
		return vl;
	}
	low=() 		=> this.#_nv;
	dead=()		=> this.#_dv;
	high=()		=> this.#_pv;
	down=(kc) 	=> { return keyIsDown(kc);}
}
///// INPUTS /////

///// RENDER PROCESS //////
const UNIT=16;
const NEAR= 0.001;
const FAR = 16;
const LENSD=FAR-NEAR;

function clip_sprite(v, u, sprite) { // scuffed as fuck
// these should really be held constant. 
// instead of running this per sprite, we should roll through
// the entire working set in one go.
	const vbf 	= v.vbf();
	const vbd 	= vbf.data();
	const fw  	= v.vbf().w()/2;
	const p 	= v.pos();
	const f 	= v.fwd();
	const o_f 	= perp2(f);
	const lv 	= new vec2(vbd[0],		 vbd[1]);
	const rv 	= new vec2(vbd[2*(fw-1)],vbd[2*fw-1]);
	const fv 	= new vec2(vbd[fw],		 vbd[fw+1]);
// we compute our perpendicular vectors
	const o_lv 	= perp2(mul2(-1,lv));
	const o_rv 	= perp2(rv);
// now we'll generate our line segment.
	const m    	= sprite.pos();
	const hw   	= sprite.w()/2;
	const a    	= add2(m, mul2(-hw,o_f)); const b = add2(m, mul2(+hw,o_f));
	const o_ab 	= perp2(sub2(a,b));
	const ap   	= sub2(a,p);
	const bp 	= sub2(b,p);
	const a_sl 	= dot2(ap,o_lv);
	const b_sl  = dot2(bp,o_lv);
	const a_sr 	= dot2(ap,o_rv);
	const b_sr  = dot2(bp,o_rv);
	const v_f   = dot2(ap,f);

	const vis = v_f > 0 && !(a_sl > 0 && b_sl > 0 || a_sr > 0 && b_sr > 0);
	if(vis) {
		const f_l 	 = 	toip2(p, fv, a, o_ab);
		const depth  = 	(f_l-NEAR)/(u*LENSD);
		const pl     =	add2(p, mul2(f_l,lv));
		const pr     =	add2(p, mul2(f_l,rv));
		const span	 = 	Math.abs(dot2(sub2(pl,pr), o_f));
		const len	 = 	sprite.w() / span;
		let begin = 0; let end = 0; let tx = 0;
		if(a_sl > 0 && b_sr > 0) {  // FULL CLIP
			end = fw-1;
			tx  = norm2(sub2(pl,a));
		}	
		if(a_sl > 0 && b_sr < 0) { // PARTIAL LEFT
			end = ~~(fw*norm2(sub2(b,pl))/span);
			tx  = norm2(sub2(pl,a));
		}
		if(b_sr > 0 && a_sl < 0) { // PARTIAL RIGHT
			begin = ~~(fw*norm2(sub2(a,pl))/span);
			end   = fw-1;
		}
		if(a_sl < 0 && b_sr < 0) { // UNCLIPPED
			begin 	 = ~~(fw*norm2(sub2(a,pl))/span);
			end 	 = ~~(fw*norm2(sub2(b,pl))/span);
		}
		sprite.clip(true,begin,end,len,depth,tx);
	}else {
		sprite.clip(false,0,0,0,0,0);
	}
}
// v 		:= viewing context
// g		:= geometry context, 
// t		:= texture context
// u 		:= world unit, 
// sdata 	:= sprite sampler, 
// sprites 	:= sprite objects
function DRAW(v,g,t,u,sprite_sampler,sprites) {
	const p   = v.pos();		// world position
	const f   = v.fwd();		// world forward
	const fov = v.fov();		// field of view
	const fbf = v.fbf();    	// fragment handler
	const zbf = v.zbf();		// depth handler
	const vbf = v.vbf();		// vspace handler
	const nbf = v.nbf();		// normals handler

	const rbf = g.rbf(); 		// level render buffer
	const spr = t.tex2D();		// texture sampler

	const zbd = zbf.data(); 	// zspace depths
	const vbd = vbf.data(); 	// vspace vectors
	const fbd = fbf.data(); 	// fragment pixels
	const nbd = nbf.data(); 	// worldspace normals
	
	const rbd = rbf.data(); 	// level render data
	const ltd = spr.data();   	// texture sampler data

	const ncx = p.x()/u;		// normalized world x
	const ncy = p.y()/u;		// normalized world y

// usually these buffers will correspond in length but just in
// case this is no longer the case I am explicitly referencing
// their sizes independently -DC @ 10/9/22
	const zw   = zbf.w(); 		// depth width
	const fw   = fbf.w(); 		// fragment width
	const fh   = fbf.h(); 		// fragment height
// DDA-START
	let xh, 	yh;
	let ivx,	ivy;
	let sx,	   	sy;
	let nd2px, 	nd2py;
	for(let i=zw-1;i>=0;i--) {
		let ivx = vbd[2*i];
		let ivy = vbd[2*i+1];
		nd2px =	ivx > 0 ?  1-(ncx % 1) : -ncx % 1;
		nd2py = ivy > 0 ?  1-(ncy % 1) : -ncy % 1;
		sx = ivx > 0 ? 0.5 : -0.5;
		sy = ivy > 0 ? 0.5 : -0.5;
		xh = DDA_X(ncx, ncy, ivx, ivy, sx, nd2px, rbf);
		yh = DDA_Y(ncx, ncy, ivx, ivy, sy, nd2py, rbf);
		const ni = 3*i;
		if(xh.toi < yh.toi) {
			zbd[i]	  = (xh.toi - NEAR)/(LENSD);		// normalized t
			nbd[ni]	  = ivx > 0 ? 1 : -1; 				// nx
			nbd[ni+1] = 0;								// ny
			nbd[ni+2] = xh.cx;							// c
		}else {
			zbd[i]=(yh.toi - NEAR)/(LENSD);				// normalized t
			nbd[ni]   = 0;								// nx
			nbd[ni+1] = ivy > 0 ? 1 : -1;				// ny
			nbd[ni+2] = xh.cy;							// c
		}
	}

// FRAGMENT-START
	for(let iw = 0; iw < fw;iw++) {
		const ni  = 3*iw;								// normal index to grab values
		const inx = nbd[ni];							// 'indexed' normal x
		const iny = nbd[ni+1];							// 'indexed' normal y
		const ind = nbd[ni+2];							// 'indexed' plane distance

		const ivx = vbd[2*iw];							// interpolated view x
		const ivy = vbd[2*iw+1];						// interpolated view y

		const depth01 = zbd[iw];						// normalized depth (not clamped)
		const depth   = depth01*LENSD + NEAR;			// unitized time of impact
		const invd01  = Math.max(0,1-depth01);			// 1 minus src depth

		const hx = ncx+ivx*depth;					 	// hit x
		const hy = ncy+ivy*depth;						// hit y

		const rwh = fh/depth; 							// real wall height
		const wh  = Math.min(rwh, fh); 					// wall height to be rendered
		const hh  = wh/2;
		const dh  = Math.floor((fh - wh)/2) + 1; 		// distance to wall height

		let tid_w = rbf.sample(~~(hx+inx*.5),~~(hy+iny*.5),0);
		if(inx != 0) tid_w = inx > 0 ? tid_w & 0xFF : (tid_w >> 8)  & 0xFF;
		else tid_w = iny < 0 ? (tid_w >> 16) & 0xFF : (tid_w >> 24) & 0xFF;

		let ah=0; let ch = 0;
		for(;ch<dh;ch++,ah++) { 						// ceiling
			const i	  = fbf.geti(iw, ah);
			const lt  = 1/(fh-2*ah);
			let wt 	  = fh*lt;
			let li    = 0.3-Math.sqrt(lt);
			let cx 	  = ncx + wt*ivx;
			let cy	  = ncy + wt*ivy;
			const ci  = spr.transform(
				rbf.sample(~~cx,~~cy,1) & 0xFF,
				u*cx,
				u*cy
			);
			fbd[i]    = ltd[ci]*li;
			fbd[i+1]  = ltd[ci+1]*li;
			fbd[i+2]  = ltd[ci+2]*li;
		}
		for(ch=0;ch<wh;ch++,ah++) { 					// walls
			const i = fbf.geti(iw, ch+fh/2 - hh);
			let fog   = invd01;
			fog *= fog;
			fog *= fog;
			const ci = spr.transform(
					tid_w,
					u*(inx*hy - iny*hx),
					u*((ch - hh)/rwh + 0.5)
			);
			fbd[i]  =ltd[ci]  *fog;
			fbd[i+1]=ltd[ci+1]*fog;
			fbd[i+2]=ltd[ci+2]*fog;
		}
		for(ch=0;ch<dh;ch++,ah++) { 					// floor
			const i	  = fbf.geti(iw, ah);
			//let   lt  = 1/(2*ch + wh);
			const lt  = -1/(fh-2*ah);
			let   wt  = fh*lt;
			let   li  = 0.3-Math.sqrt(lt);
			let   cx  = ncx + wt*ivx;
			let   cy  = ncy + wt*ivy;

			const ci  = spr.transform(
				(rbf.sample(~~(cx),~~(cy),1) >> 8) & 0x00FF,
				u*cx,//(ncx + wt*ivx),
				u*cy//(ncy + wt*ivy)
			);
			fbd[i]    = ltd[ci]*li;
			fbd[i+1]  = ltd[ci+1]*li;
			fbd[i+2]  = ltd[ci+2]*li;
		}
	}
// draw sprites
	if(!sprites || !sprite_sampler) {
		return;
	}
	const dat = sprite_sampler.data();
	const fh2   = fh/2;
	for(let i=1;i<sprites.length;i++) {
		const sp = sprites[i];
		if(!sp.vis()) continue;
		const depth01 = Math.min(1,sp.d());
		const depth10 = 1-depth01;
		const depth   = depth01*LENSD;
		const rwh   = (sp.h()*fh)/(UNIT*depth);
		const wh    = Math.min(fh,rwh);
		const hh 	= wh>>1;
		const wdif  = sp.e() - sp.b();
		const rwdth = sp.l()*fw;
		for(let iw=0;iw<wdif;iw++) { // skip scanlines behind wall geometry
			const irw = sp.w()*(iw/rwdth) + sp.tx();
			for(let ih=0;ih<wh;ih++) {
				const i = fbf.geti(iw+sp.b(),ih+fh2 - hh);
				const ci = sprite_sampler.transform_sprite(sp.sid(),
					irw, 							// U
					sp.h()*((ih - hh)/rwh),	 		// V
					sp.ox(),					 	// UNTRANSFORMED U OFFSET
					sp.oy()					 		// UNTRANSFORMED V OFFSET
				);
 				if(!(dat[ci+3]&0xFF)) continue;  // cutoff
				fbd[i]	 = dat[ci]*depth10;
				fbd[i+1] = dat[ci+1]*depth10;
				fbd[i+2] = dat[ci+2]*depth10;
			}
		}
	}
}

function DDA_X(ncx, ncy, rx, ry, sx, ndpx, grd) {
	let  dt=0; let toi=0;
	let  cx=0; let  cy=0;
	let ndx=0; let ndy=0;
	if(Math.abs(rx) < 0.00001) 
		return { toi:1000,cx:-1,cy:-1 };
	if(rx > 0) {
		dt  = 1/rx;
		ncx += ndpx;
		toi = ndpx * dt;
		ncy += ry * toi;
		ndx = 1;
		ndy = ry/rx;
	}else {
		dt  = -1/rx;
		ncx += ndpx;
		toi = -ndpx * dt; 
		ncy += ry * toi;
		ndx = -1;
		ndy = -ry/rx;
	}
	while(toi<1000) { 						// safety check? nah fuck that : )
		cx = (ncx+sx) - (ncx+sx)%1;
		cy = (ncy) - (ncy%1);
		if(!grd.bounds(cx,cy,0)) break; 	// bounds check
		if(grd.sample(cx,cy,0) != 0) break; // did we hit a surface?
		ncx += ndx;
		ncy += ndy;
		toi += dt;
	}
	return {toi,cx,cy};
}
function DDA_Y(ncx, ncy, rx, ry, sy, ndpy, grd) {
	let dt=0;  let toi=0;
	let cx=0;  let cy=0;
	let ndx=0; let ndy=0;
	if(Math.abs(ry) < 0.00001) return {toi:1000, cx:-1, cy:-1};
	if(ry > 0) {
		dt  = 1/ry;
		ncy += ndpy;
		toi =  ndpy * dt;
		ncx += rx * toi;
		ndx = rx/ry;
		ndy = 1;
	}else {
		dt  = -1/ry;
		ncy += ndpy;
		toi = -ndpy * dt; 
		ncx += rx * toi;
		ndx = -rx/ry;
		ndy = -1;
	}
	while(toi<1000) {
		cx = ncx - (ncx)%1;
		cy = ncy+sy - (ncy+sy)%1;
		if(!grd.bounds(cx,cy,0)) break; // bounds check
		if(grd.sample(cx,cy,0) != 0) break; // did we hit a surface?
		ncx += ndx;
		ncy += ndy;
		toi += dt;
	}
	return {toi,cx,cy};
}
///// RENDER PROCESS //////

// jlvl 	:= json object data loaded from I/O
// dim 		:= the level dimensions that will define several buffers in use (these will grow over time)
// loaded 	:= whether or not the level has finished loading from I/O
// rbuf 	:= render buffer used during the DDA-raycast procedure
// cbuf 	:= collision buffer used during the physics procedure
class LevelContext {
	#_jlvl; #_dim;
	#_rbuf; #_cbuf;
	#_tex2D;
	constructor(jlvl, tex2D) {
		this.#_jlvl 	= jlvl;
		this.#_tex2D 	= tex2D;
		this.#_dim		= new vec2(Math.floor(jlvl.dim[0]), Math.floor(jlvl.dim[1]));
// RENDER BUFFER ALLOCATION
		const w			= this.#_dim.x(); 			// x dim
		const h			= this.#_dim.y(); 			// y dim
		this.#_rbuf		= new BufferUI32_2D(w,h,2);
		const s			= this.#_rbuf.s();		
		const rbd		= this.#_rbuf.data();
		let i=0;
		for(;i<w*h;i++) { 							// POPULATE
			rbd[i]	 	= jlvl.r_sectors[i][0];		// PLANAR FACES
			rbd[i+w*h] 	= jlvl.r_sectors[i][1];		// UP AND DOWN FACES
		}
// COLLISION BUFFER ALLOCATION
		this.#_cbuf		= new BufferUI32_2D(w,h,1);
		const cbd		= this.#_cbuf.data();
		for(i=0;i<w*h;i++) {
			cbd[i]		= jlvl.c_sectors[i];
		}
	}
	dim=()=>this.#_dim;
	rbf=()=>this.#_rbuf;
	cbf=()=>this.#_cbuf;
	tex2D=()=>this.#_tex2D;
}

// useful for storing view transformations. We can now context switch
// between different perspectives. This also allows us to do some pretty
// cool effects involving zbuffering
class ViewContext {
	#_pos; #_fwd; #_fov; #_dim; #_scl;
	#_zbf; #_fbf; #_vbf; #_sbf; #_nbf;
	#_vbfdirty;
	constructor(pos,fwd,fov,dim,scl) {
// account for upscaling
		dim = new vec2(~~(dim.x()/scl),~~(dim.y()/scl));
		this.#_pos 	 = pos;   	// what is our initial point in the plane?
		this.#_fwd 	 = fwd;	  	// what is our initial looking direction?
		this.#_fov 	 = fov;	  	// what is our field of view??
		this.#_dim 	 = dim;	  	// what are our viewport's dimensions?
		this.#_scl   = scl; 	// by what factor are we upscaling?
		this.#_vbfdirty = true; // tell the renderer to compute our view vectors
// store our depth buffer in our viewing context
		this.#_zbf = new BufferF32(dim.x());
// we will pack our interpolated viewing vectors to avoid lerping across loops
		this.#_vbf = new BufferF32(2*dim.x()); 
// we will also store the planes hit in our casting stage in a buffer
		this.#_nbf = new BufferF32(3*dim.x());
// store our fragment data
		this.#_fbf = new ImageBuffer(dim.x(), dim.y());
// normalized screen space coordinates
		this.#_sbf = new BufferF32(2*dim.x()*dim.y());
// initialize screen space (precalculating gradients)
		const sbd  = this.#_sbf.data();
		let i = 0;
		for(;i<dim.x()-1;i++) 	 sbd[2*i]     = i/dim.x(); 
		for(i=1;i<dim.y()-1;i++) sbd[(2*i)-1] = i/dim.y();
	}	
	pos=()=>this.#_pos;
	fwd=()=>this.#_fwd;
	fov=()=>this.#_fov;
	zbf=()=>this.#_zbf;
	fbf=()=>this.#_fbf;
	vbf=()=>this.#_vbf;
	sbf=()=>this.#_sbf;
	nbf=()=>this.#_nbf;
	scl=()=>this.#_scl;
// after we've modified our movement we'll need to recompute our viewing vectors
// we can save cycles by toggling a dirty bit if our fwd or fovs have changed
	bind=(pos,fwd,fov)=> {
		this.#_pos=pos;
		this.#_fwd=fwd;
		this.#_fov=fov;
		this.#_vbfdirty=true;
// re-calculate viewing vectors
		if(this.#_vbfdirty) {
			const vbd = this.#_vbf.data();
			const sbd = this.#_sbf.data();
			const lv = rot2(this.#_fwd, -this.#_fov/2);
			const rv = rot2(this.#_fwd, +this.#_fov/2);
			let iw= 0; let ic=0; let it=0;
			vbd[ic++]=lv.x();
			vbd[ic++]=lv.y();
			for(iw=1;iw < this.#_dim.x()-1;iw++) {
				it = sbd[2*iw];
				vbd[ic++]=(1-it)*lv.x() + it*rv.x();
				vbd[ic++]=(1-it)*lv.y() + it*rv.y();
			}
			vbd[ic++]=rv.x(); vbd[ic++]=rv.y();
			this.#_vbfdirty=false;
		}
	}
	move=()=> {
		if(keyIsDown(81)) { 
			this.#_fov += 20*deltaTime/1000;
			this.#_vbfdirty = true;
		}
		if(keyIsDown(69)) {
			this.#_fov -= 20*deltaTime/1000;
			this.#_vbfdirty = true;
		}
		if(keyIsDown(83)) { 
			this.#_pos = sub2(this.#_pos, mul2(30*deltaTime/1000, this.#_fwd));
		}
		if(keyIsDown(87)) {
			this.#_pos = add2(this.#_pos, mul2(30*deltaTime/1000, this.#_fwd));
		}
		if(keyIsDown(68)) { 
			this.#_fwd = rot2(this.#_fwd, 200*deltaTime/1000); 
			this.#_vbfdirty = true;
		}
		if(keyIsDown(65)) { 
			this.#_fwd = rot2(this.#_fwd, -200*deltaTime/1000); 
			this.#_vbfdirty = true;
		}
	}
// draw to pixels buffer
	flush=(cv=null)=> { this.#_fbf.flush(cv,0,0,this.#_scl); }
	flush2=(cv=null,sx,sy)=> { this.#_fbf.flush2(cv,0,0,this.#_scl*sx,this.#_scl*sy); }
}

class BillboardContext {
	#_id;
	#_pos;			// world position
	#_w; #_h; #_d;	// width, height and depth of sprite
	#_b; #_l; #_e; 	// begin line, unclipped normalized sprite length, end line
	#_tx;			// texture offset (used when clipping sprites)
	#_vis;			// visibility for the bound viewContext
	#_sd;			// sprite descriptor (see Sampler2D)
	#_ox; #_oy;		// offsets
	constructor() {}
	bind(vals) {
		this.#_id   = vals.id;
		this.#_pos 	= vals.pos;
		this.#_w	= vals.w;
		this.#_h	= vals.h;
		this.#_ox	= vals.ox;
		this.#_oy	= vals.oy;
		this.#_sd	= vals.sd;
	}
	bind_id=(id)	=> { this.#_id = id; }
	bind_ox=(ox)	=> { this.#_ox = ox; }
	bind_oy=(oy)	=> { this.#_oy = oy; }
	bind_pos=(pos)	=> { this.#_pos = pos; }
	bind_w	=(w)	=> { this.#_w = w; }
	bind_h	=(h)	=> { this.#_h = h; }
	bind_sd=(sd)	=> { this.#_sd = sd; }
	clip=(vis,b,e,l,d,tx)=> { // view contexts will call clip() in clip_sprite(...)
		this.#_vis 	= vis;	// visibility
		this.#_b   	= b; 	// begin
		this.#_e   	= e; 	// end
		this.#_l	= l; 	// span
		this.#_d	= d; 	// depth
		this.#_tx	= tx; 	// offset
	}
	id=()	=>  this.#_id;
	sid=()	=> 	this.#_sd;
	pos=()	=>  this.#_pos;
	w=()	=> 	this.#_w;
	h=()	=> 	this.#_h;
	d=()	=> 	this.#_d;
	b=()	=> 	this.#_b;
	l=()	=> 	this.#_l;
	e=()	=> 	this.#_e;
	tx=()	=> 	this.#_tx;
	vis=()	=> 	this.#_vis && this.#_id != 0;
	ox=()	=> 	this.#_ox;
	oy=()	=> 	this.#_oy;
}

// constructs a default man object for a FSM
const CONSTRUCTOR_MAN=()=> {
	return {
		_cur:null, // assign first state
		cur:function() { return this._cur; },
		setcur(nxt) { this._cur = nxt; },
	}
};
// we assume that our state machine is initialized and does not modify existing
// data that the fsm requires.
class FSM {
	#_dict;
// states, middleman
	constructor(states) {
		this.assert(states != null && states.length > 0, "state bag was empty or null.");
		this.#_dict = [];
// append all new states to dictionary object
		for(let i = 0;i < states.length;i++) {
			const state = states[i];
			this.vstate(state, "state object was not constructed properly. see fsm.js.");
			this.#_dict[state.key] = state;
		}
	}
	pulse=(man)=> {
		const cur = man.cur();
		cur.pulse(this, man);
	}
	setup=(man)=> {
		for(const o in this.#_dict) { 
			const stt = this.#_dict[o];
			stt.setup(this, man);
		} 
	}
	remove=(man)=> {
		for(const o in this.#_dict) {
			const stt = this.#_dict[o];
			stt.remove(this, man);
		}
	}
	cswitch=(man, next_key)=> {
		const cur = man.cur();
		const next = this.sget(next_key);
		this.assert(next != null);
		cur.exit(next_key, this, man); 		// Notify old state of man that its leaving
		man.setcur(next);					// Context switch
		next.enter(cur.key, this, man);		// Notify new state of man that its entering
	}
	set=(man, next_key)=> {
		const next = this.sget(next_key);
		this.assert(next != null);	
		man.setcur(next);					// Context switch
		next.enter('set', this, man);		// Notify new state of man that its entering
	}
	sget=(key)=> key in this.#_dict ? this.#_dict[key] : null;
	assert(cond, output) { if(!cond) throw new Error("assertion failed:" + output); }
	vstate(state) { // determine if new state object has the required components
		return Object.hasOwn(state, 'key') &&
			Object.hasOwn(state, 'enter') &&
			Object.hasOwn(state, 'exit') &&
			Object.hasOwn(state, 'setup') &&
			Object.hasOwn(state, 'pulse');
	}
}
// simple list of objects that can be overridden after destructing.
class ObjectList {
	#_objs; #_uidh;
	constructor(uidh, nullobj) {
		this.#_uidh = uidh;
		this.#_objs = new Array();
// reserve the first slot for the null object
		this.#_uidh.reserve();
		this.#_objs.push(nullobj);
	}
	write_obj=(ctor, props)=> {
		const obj = ctor();
		const next = this.#_uidh.reserve();
// if our next index is larger, push. if not, overwrite.
		if(next >= this.#_objs.length) this.#_objs.push(obj);
		else this.#_objs[next] = obj;
// write ID
		props.id = next;
		obj.bind(props);
		return obj;
	}
	get_obj=(uid)=> {
// if requested UID is zero: return null
		if(uid==0) return null;
// if the entity in question houses a zero uid, that means its dead: return null		
		const obj = this.#_objs[uid];
		if(obj.uid() == 0) return null;
		else return obj;
	}
	rem_obj=(uid, dtor)=> {
// if attempting to remove null entity, dont!
		if(uid==0) return;
		dtor(this.#_objs[uid]);
		this.#_uidh.open(uid);
	}
	length=()=> { return this.#_objs.length; }
	count=()=> { return this.length() - this.#_uidh.reservedcount(); }
// primarily useful to expose the list to the renderer. terrible idea btw.
	data=()=> { return this.#_objs; }
}

// handles assign unique ids to every entity.
class UIDHandler {
	#_list; #_top;
	constructor() {
		this.#_list = new Array();
// any index at zero is an invalid index.
		this.#_top  = 0;
	}
// get a new id.
	reserve=()=> {
		if(this.#_list.length > 0) {
			return this.#_list.pop();
		}else {
			return this.#_top++;
		}
	}
// open up a new slot to assign to.
	open=(id)=> {
		this.#_list.push(id);
	}
	reservedcount=()=> { return this.#_list.length; }
}

class Board {
	#_buf;
	constructor(dim, col) {
		const w = ~~dim.x();
		const h = ~~dim.y();
		this.#_buf = new BufferUI32_2D(w,h,1);
		const dat = this.#_buf.data();
		const s = this.#_buf.s();
		if(col != null) {
			for(let i = 0;i < s;i++) {
				dat[i]=col[i];
			}
		}
	}
	s=()=>this.#_buf.s();
	w=()=>this.#_buf.w();
	h=()=>this.#_buf.h();
// given two coordinates, swap their ids
	swap=(x1,y1,x2,y2)=> {
		const b = this.#_buf;
		const d = b.data();
		const i1 = (x1+y1*b.w());

		const i2 = (x2+y2*b.w());
		const id1 = d[i1];
		d[i1] = d[i2];
		d[i2] = id1;
	}
	swapf=(x1,y1,x2,y2)=> {
		const b = this.#_buf;
		const d = b.data();
		const i1 = ((~~x1)+(~~y1)*b.w());

		const i2 = ((~~x2)+(~~y2)*b.w());
		const id1 = d[i1];
		d[i1] = d[i2];
		d[i2] = id1;
	}
// set a particular coordinate to a number
	set=(x,y,id)=> {
		const b = this.#_buf;
		const d = b.data();
		d[(x+y*b.w())] = id;
	}
	setf=(x,y,id)=> {
		const b = this.#_buf;
		const d = b.data();
	
		d[((~~x)+(~~y)*b.w())] = id;
	}
	sample=(x,y)=> { return this.#_buf.sample(x,y,0); }
	samplef=(x,y)=> { 
		return this.#_buf.sample(~~x,~~y,0);
	}
	samplei=(i)=> {
		i = ~~i;
		return this.sample(i%this.w(),i/this.w());
	}
}
class BufferUI32_2D { 
// contains unsigned int 32s
// used for buffers that act as if they are two dimensional, but really aren't.
// p := number of uint32s per coordinate pair (w,h)
// -DC @ 10/12/22
	#_w; #_h; #_s; #_p; #_buf;
	constructor(w, h, p=1) {
		this.#_w = w;
		this.#_h = h;
		this.#_p = p;
		this.#_s = w*h*p;
		this.#_buf = new Int32Array(this.#_s);
	}
	w=()=>this.#_w;
	h=()=>this.#_h;
	p=()=>this.#_p;
	s=()=>this.#_s;
	data=()=>this.#_buf;
// these functions are really just for QOL. I fully intend to inline accessing data in the array.
// There's no need to construct a stack frame every single time I access an object in the array.
	bounds=(x,y,z) => {
		const i = x + y*this.#_w + z*this.#_w*this.#_h;
		return i >= 0 && i <= this.#_s;
	}
	get_i=(x,y,z)=> {
		return x+y*this.#_w+z*this.#_w*this.#_h;
	}
	sample=(x,y,z) => this.#_buf[x+y*this.#_w+z*this.#_w*this.#_h];
}
class BufferF32 {
	#_w; #_buf;
	constructor(w) {
		this.#_w = w;
		this.#_buf = new Float32Array(w);
	}
	w=()	=> this.#_w;
	data=()	=> this.#_buf;
}
// Buffered Image class that primarily contacts p5's render context. This is our fragment buffer.
// We'll write to this buffer and directly apply it to the canvas via the flush(); call.
class ImageBuffer {
	#_w; #_h; #_gl;
	constructor(w,h) {
		this.#_w = w;
		this.#_h = h;
		this.#_gl = createGraphics(w,h);
	}
	data=() 			=> { return this.#_gl.pixels; }
	bind=()				=> { this.#_gl.loadPixels(); }
	apply=() 			=> { this.#_gl.updatePixels(); }
	flush=(cv,x=0,y=0,s=1) => { 
		if(cv != null) cv.image(this.#_gl,x,y,s*this.#_w,s*this.#_h);
		else image(this.#_gl,x,y,s*this.#_w,s*this.#_h);
	}
	flush2=(cv,x=0,y=0,sx=1,sy=1) => { 
		if(cv != null) cv.image(this.#_gl,x,y,sx*this.#_w,sy*this.#_h);
		else image(this.#_gl,x,y,sx*this.#_w,sy*this.#_h);
	}
	geti=(x,y) 			=> (4*(x-(x%1)+(y-(y%1))*this.#_w));
	w=() 				=> this.#_w;
	h=() 				=> this.#_h;
	glc=() 				=> this.#_gl;
}
// A custom buffer handler for level geometry that loads a tileset image into
// memory, and reformats it into a much more cache-friendly way for our scanline
// approach. Instead of directly encoding image data along xy, we are going to
// encode pixel information along our individual tile's columns onto a one dimensional
// strip. This way, subsequent samples to that same texture will be more likely
// to contain that data in the cache line.
class Sampler2D {
	#_buf; #_img; #_w; #_h; #_tds;
// at this point we guarantee that the image is loaded
	constructor(tds, tsimg) {
		let tw=0; // total width
		let th=0; // total height
// precalculate the number of pixels we need
		tds.sort((a,b)=>a.id-b.id);
		for(const td of tds) { tw += td.w; th += td.h; }
		this.#_w   	= tw;
		this.#_h	= th;
		this.#_tds	= tds;
		this.#_buf 	= new Uint8ClampedArray(4*tw*th);
		this.carve_buf(tsimg); // carve out the textures into our buffer
		this.#_img = tsimg;
	}
	carve_buf=(tsimg)=> {
		tsimg.loadPixels();		 		// needed for p5 to populate the pixels buffer
		const buf 	= this.#_buf; 		// shorthand definition
		const tds	= this.#_tds;		// our texture descriptors
		const px 	= tsimg.pixels;		// pixels buffer of our texture set
		const img_w	= tsimg.width; 		// needed for indexing into image
// sort our texture descriptors based on their ids. This ensures that every carve
// will place our texture data into the right positions.
		let i=0; // our index into the buffer
		tds.sort((a,b)=>a.id-b.id);
		for(let td of tds) {
			const ox=td.ox; const oy=td.oy;
			const tx=td.w;	const ty=td.h;
// append an offset index to our texture descriptor for later use
// this is needed as our individual texture descriptors are not of
// uniform dimension.
			td.ofs = i;
// read a wxh block of pixels offset by ox,oy
			for(let ix=ox;ix<ox+tx;ix++) {
				for(let iy=oy;iy<oy+ty;iy++) {
					const pi=4*(ix+iy*img_w); // multiples of 4: RGBA
					buf[i++]=px[pi];
					buf[i++]=px[pi+1];
					buf[i++]=px[pi+2];
					buf[i++]=px[pi+3];
				}
			}
		}
	}
// transforms local uvs of texture to global uvs of sampler
// usage: let i=transform(ti,x,y);
// px[0] = buf[i]; px[1] = buf[i+1]; ...
	transform=(ti,x,y)=>{
		const td = this.#_tds[ti];
		x = ~~x; y = ~~y; // evil bit hacking >:) mwahahaha
		x  = (x>=0) ? (x % td.w) : td.w - ((-x)%td.w) - 1;
		y  = (y>=0) ? (y % td.h) : td.h - ((-y)%td.h) - 1;
		return td.ofs+((y+x*td.h)<<2);
	}
	transform_sprite=(ti,x,y,x0,y0)=>{
		const td = this.#_tds[ti];
		x *= td.sx; y *= td.sy;
		x += (x0 + td.cx); y += (y0 + td.cy);
		x = ~~x; y = ~~y; // evil bit hacking >:) mwahahaha
		x = x <= 0 ? 0 : x; x = x < td.w ? x : td.w-1;
		y = y <= 0 ? 0 : y; y = y < td.h ? y : td.h-1;
		return td.ofs+((y+x*td.h)<<2);
	}
	data=()=>this.#_buf;
// used for debugging tileset after carving
	drawts=(px,pw,ph)=> {
		const buf = this.#_buf;
		const w   = this.#_w; const h = this.#_h;
		let to	  =	0;
		for(const td of this.#_tds) {
			const tw = td.w;  const th = td.h;
			const ox = td.ox; const oy = td.oy;
			for(let ix=0;ix<tw;ix++) {
				for(let iy=0;iy<th;iy++) {
					const bi=4*(iy+ix*th)+td.ofs;
					const pi=4*(ix+(to+iy)*pw);
					px[pi]=buf[bi];
					px[pi+1]=buf[bi+1];
					px[pi+2]=buf[bi+2];
					px[pi+3]=buf[bi+3];
				}
			} to+=th;
		}
	}
	draw_carve=(px,pw,ph,tid)=> {
		const td  = this.#_tds[tid];
		const buf = this.#_buf;
		const w   = this.#_w; const h = this.#_h;
		const tw  = td.w;  const th = td.h;
		const ox  = td.ox; const oy = td.oy;
		for(let ix=0;ix<tw;ix++) {
			for(let iy=0;iy<th;iy++) {
				const bi=4*(iy+ix*th)+td.ofs;
				const pi=4*(ix+(iy)*pw);
				px[pi]=buf[bi];
				px[pi+1]=buf[bi+1];
				px[pi+2]=buf[bi+2];
				px[pi+3]=buf[bi+3];
			}
		}
	}
	dbg=(w,h)=> {
		loadPixels();
		this.drawts(pixels,w,h);
		updatePixels();
	}
	write_tid=(id1,id2)=> {
		this.#_tds[id1] = this.#_tds[id2];
	}
	img=()=>this.#_img;
	tds=()=>this.#_tds;
}
// a sorted list of all tracks loaded in setup()
class Tracksheet {
	#_tracks;
	constructor() { this.#_tracks = []; }
	add_track=(tobj)=> {
		this.#_tracks.push(tobj);
		this.#_tracks.sort((a,b)=>a.id-b.id);
	}
	get_track=(tid)=> { return this.#_tracks[tid]; }
}

// a sorted list of all sounds loaded in setup()
class Soundsampler {
	#_sounds;
	constructor() { this.#_sounds = []; }
	add_sound=(sobj)=> {
		this.#_sounds.push(sobj);
		this.#_sounds.sort((a,b)=>a.id-b.id);
	}
	get_sound=(sid)=> { return this.#_sounds[sid]; }
}
// a state machine custom tailored for record tracks
class Trackplayer {
	#_curtrack; #_tracksheet;
	constructor(tracksheet) {
		this.#_tracksheet = tracksheet;
		this.#_curtrack = tracksheet.get_track(0);
	}
	switch_track=(tid)=> {
		const next_track = this.#_tracksheet.get_track(tid);
// pause old track
		this.stop_track();
// clear the old onended callback
		this.#_curtrack = next_track;
	}
	play_track=()=> { this.#_curtrack.track.play(); }
	stop_track=()=> { this.#_curtrack.track.stop(); }
	pause_track=()=> { this.#_curtrack.track.pause(); }
	track_time=()=> { return this.#_curtrack.track.currentTime(); }
	track_length=()=> { return this.#_curtrack.track.duration(); }
	track_bpm=()=> { return this.#_curtrack.bpm; }
}
// Stores a javascript object that bundles sounds relative to the entity type
class Soundsheet {
// cad := current active entity context
// ads := active entity
// ss  := sound sampler
	#_ads; #_ss; #_cad;
	constructor(ads, ss) {
		this.#_ads = ads;
		this.#_ss = ss;
	}
	bind=(ad)=> {
		this.#_cad = this.#_ads[ad];
	}
	play_frame=(t)=> {
		t %= this.#_cad.length;
		const sid = this.#_cad[t].sid;
		this.#_ss.get_sound(sid).sound.play();
	}
}
// Stores animation descriptors provided a js object read from a
// *ads.json file.
class Flipsheet {
	#_ads; #_cad;
	constructor(ads) {
		this.#_ads = ads;
	}
	bind=(ad)=> {
		this.#_cad = this.#_ads[ad];
	}
	get_frame=(t)=> {
// return something valid for negative time values.
		const frms = this.#_cad.frames;
		if(t<0) return frms[0].tid;
// if we don't want to repeat, just return the last frame
		if(t>=1 && !this.#_cad.repeat) return frms[frms.length-1].tid;
// map to range [0,1]
		t %= 1; let i=0; let et=0;
		for(;i<frms.length;i++) {
			et += frms[i].ft;
			if(t<et) break;
		}
		return frms[(i % frms.length)].tid;
	}
}
