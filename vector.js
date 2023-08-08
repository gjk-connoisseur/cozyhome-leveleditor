// I figured it's probably beneficial to move the 
// vector library into a separate file going forwards
// im going to continue keeping a glsl-type declaration 
// for compability reasons in the event older projects
// will migrate -DC @ 9/3/22
//vec2
const add2 = (v,w) => new vec2(v.x()+w.x(),v.y()+w.y());
const sub2 = (v,w) => new vec2(v.x()-w.x(),v.y()-w.y());
const mul2 = (c,v) => new vec2(c*v.x(),c*v.y());
const dot2 = (v,w) => v.x()*w.x()+v.y()*w.y();
const sqrnorm2 = (v) => dot2(v,v);
const norm2 = (v) => Math.sqrt(dot2(v,v));
const perp2 = (v) => new vec2(-v.y(), v.x());
const floor2 = (v) => new vec2(~~v.x(), ~~v.y());
const unit2 = (v) => {
	const u = norm2(v);
	return u > 0.0001 ? new vec2(v.x()/u,v.y()/u) : v;
}
const ref2 = (v,n) => {
	const un = unit2(n);
	const vn = -2*dot2(v,n);
	return new vec2(v.x()+n.x()*vn, v.y()+n.y()*vn);
}
const rot2 = (v,a) => {
	a *= Math.PI / 180;
	const sa = Math.sin(a);
	const ca = Math.cos(a);
	return new vec2(v.x()*ca - v.y()*sa, v.x()*sa + v.y()*ca);
}
const proj2 = (v,w) => {
	const ww = dot2(w,w);
	if(ww < 0.0001) return w;
	const vw = dot2(v,w);
	return mul2(vw/ww, w);
}
const proj2s = (v,w) => {
	const ww = dot2(w,w);
	if(ww < 0.0001) return w;
	const vw = dot2(v,w);
	return vw/(ww);
}
const toip2 = (p0, r, c, n) => {
	const rn = -dot2(r,n);
	const cn = dot2(c,n);
	const pn = dot2(p0,n);
	return Math.abs(rn) > 0.001 ? (pn - cn) / rn : -1;
}
const angle2 = (v,w) => {
	v = unit2(v);
	w = unit2(w);
	return Math.acos(dot2(v,w)) * 180 / Math.PI;
}
const wangle2 = (v) => {
	return Math.atan2(v.x(),v.y());
}
const toip2_xy = (px,py,rx,ry,cx,cy,nx,ny) => {
	const rn = -(rx*nx+ry*ny);
	const cn =  (cx*nx+cy*ny);
	const pn =  (px*nx+py*ny);
	console.log((pn-cn)/rn);
	return Math.abs(rn) > 0.001 ? (pn-cn)/rn : -1;
}

const loip2 = (p0, r, c, n) => {
	return toip2 / norm2(r);
}
const lerp2 = (a,b,t) => {
	return new vec2((1-t)*a.x() + t*b.x(), (1-t)*a.y() + t*b.y());
}
const invlerp2 = (a,b,c) => {
	return norm2(sub2(c,a)) / norm2(sub2(a,b));
}
const invbilerp2 = (a,b,c,d,e,f) => {
	return new vec2(
		invlerp2(a,b,e),
		invlerp2(c,d,f)
	);
}
const bilerp2 = (a,b,c,d,t1,t2) => {
	return add2(lerp2(a,b,t1), lerp2(c,d,t2));
}
const smstep = (t) => {
	const v1 = t*t;
	const v2 = 1 - (1-t)*(1-t);
	return (1-t)*v1 + v2*t;
}
const draw2 = (v, glc) => {
	if(glc == null) line(0,0,v.x(),v.y());
	else glc.line(0,0,v.x(),v.y());
}

const draw2p = (p,v,glc) => {
	if(glc == null) line(p.x(),p.y(),p.x()+v.x(),p.y()+v.y());
	else glc.line(p.x(),p.y(),p.x()+v.x(),p.y()+v.y());
}
const drawpln2 = (p,n,glc) => {
	const prp = perp2(n);
	draw2p(p,mul2(128,prp),glc);
	draw2p(p,mul2(-128,prp),glc);
	draw2p(p,mul2(4,n),glc);
}
class vec2 {
	constructor(x,y) {
		this._x=x;
		this._y=y;
	}
	x=()=>this._x;
	y=()=>this._y;
}
// nice wrapper for tuples that should be considered as three states:
// enter, exit, inbetween
class lerped2 {
	constructor() {}
	binds=(a)=> {
		this.bind(a,a);
	}
	bind=(a,b)=> {
		this._a=a;
		this._b=b;
	}
	lerp=(t)=> {
		return lerp2(this._a, this._b, t);
	}
	slerp=(t)=> {
		return unit2(this.lerp(t));
	}
	a=()=>this._a; // start
	b=()=>this._b; // end
}

//vec3
const add3 = (v,w) => new vec3(v.x()+w.x(),v.y()+w.y(), v.z()+w.z());
const sub3 = (v,w) => new vec3(v.x()-w.x(),v.y()-w.y(), v.z()-w.z());
const mul3 = (c,v) => new vec2(c*v.x(),c*v.y(),c*v.z());
const dot3 = (v,w) => v.x()*w.x()+v.y()*w.y()+v.z()*w.z();
const norm3 = (v) => Math.sqrt(dot3(v,v));
const cross3 = (v,w) => new vec3(
	v.y()*w.z()-v.z()*w.y(), //x
	v.z()*w.x()-w.z()*v.x(), //y
	v.x()*w.y()-w.x()*v.y()  //z
);
const unit3 = (v) => {
	const u = norm3(v);
	return u > 0.0001 ? new vec3(v.x()/u,v.y()/u,v.z()/u) : v;
}
const ref3 = (v,n) => {
	const un = unit3(n);
	const vn = -2*dot3(v,n);
	return new vec2(v.x()+n.x()*vn,v.y()+n.y()*vn,v.z()+n.z()*vn);
}
const proj3 = (v,w) => {
	const ww = dot3(w,w);
	if(wv < 0.0001) return w;
	const vw = dot3(v,w);
	return mul3(vw/ww, w);
}
class vec3 {
	constructor(x,y,z) {
		this._x=x;
		this._y=y;
		this._z=z;
	}
	x=()=>this._x;
	y=()=>this._y;
	z=()=>this._z;
}
